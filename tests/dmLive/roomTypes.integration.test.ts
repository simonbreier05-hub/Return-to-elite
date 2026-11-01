import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-rt-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn() }));

import { prisma } from "@/lib/db";
import { extractPdfLines } from "@/lib/import/pdfText";
import { parseArrivals, parseDepartures } from "@/lib/import/parsers";
import { recordRoomTypes, saveRoomTypeMap } from "@/lib/import/roomTypes";
import { PATCH as settingsPatch, GET as settingsGet } from "@/app/api/settings/route";
import { PATCH as guestPatch } from "@/app/api/guest-requests/[id]/route";
import { buildArrivalsPdf, buildDeparturesPdf } from "./../fixtures/opera/build";
import { getLiveOverview } from "@/lib/lists/overview";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
const D = "2026-09-22";
const ids: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["dm", "duty_manager"], ["sup", "supervisor"]] as const) ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: k, passwordHash: "x", role, ...(k === "sup" ? { assignedFloors: "2" } : {}) } })).id;
  for (const [n, f] of [["201", 2], ["202", 2], ["203", 2]] as const) ids[n] = (await prisma.room.create({ data: { number: n, floor: f, section: "2A", type: "UNVERIFIED" } })).id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Zimmerart aus den Opera-Listen", () => {
  it("Parser liest nur den Code (auch wenn er an der Nachtzahl klebt), nie den Block-Code", async () => {
    const dep = parseDepartures(await extractPdfLines(await buildDeparturesPdf()));
    const arr = parseArrivals(await extractPdfLines(await buildArrivalsPdf()));
    const codes = new Set([...dep.rows, ...arr.rows].map((r) => r.roomType));
    expect(codes).toEqual(expect.objectContaining(new Set(["STDK", "DLXK", "LFAMIL"])));
    expect([...codes].join(",")).not.toMatch(/BLK9|RACK|CORP/);
  });

  it("ohne Zuordnung wird nichts gesetzt (nie geraten) und der Code wird gemeldet", async () => {
    const r = await recordRoomTypes([{ room: "201", roomType: "DLXK" }, { room: "202", roomType: "STDK" }]);
    expect(r).toEqual({ applied: 0, unmapped: ["DLXK", "STDK"] });
    expect((await prisma.room.findUniqueOrThrow({ where: { id: ids["201"] } })).type).toBe("UNVERIFIED");
  });

  it("Zuordnung in den Einstellungen (nur Duty Manager/Supervisor-Route) wirkt sofort auf Zimmer ohne Art", async () => {
    as("dm", "duty_manager");
    const res = await settingsPatch(new NextRequest("http://x/api/settings", { method: "PATCH", body: JSON.stringify({ roomTypeMap: { DLXK: "DELUXE", STDK: "CLASSIC" } }) }));
    expect(res.status).toBe(200);
    const types = Object.fromEntries((await prisma.room.findMany()).map((r) => [r.number, r.type]));
    expect(types).toMatchObject({ "201": "DELUXE", "202": "CLASSIC", "203": "UNVERIFIED" });
    const get = await (await settingsGet()).json();
    expect(get.roomTypeMap).toEqual({ DLXK: "DELUXE", STDK: "CLASSIC" });
  });

  it("von Hand gesetzte Arten bleiben; UNVERIFIED lässt sich nicht als Ziel zuordnen", async () => {
    await prisma.room.update({ where: { id: ids["203"] }, data: { type: "SUITE" } });
    await saveRoomTypeMap({ DLXK: "UNVERIFIED", XYZ: "SUITE" });
    await recordRoomTypes([{ room: "203", roomType: "XYZ" }]);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: ids["203"] } })).type).toBe("SUITE");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: ids["201"] } })).type).toBe("DELUXE");
  });
});

describe("Gast-DND beenden und Supervisor-Karte mit Anreise-Zimmern", () => {
  it("Supervisor beendet das Gast-DND; es steht im Zimmer-Logbuch", async () => {
    const g = await prisma.guestRequest.create({ data: { roomId: ids["201"], kind: "DND", status: "RECEIVED" } });
    as("sup", "supervisor");
    const res = await guestPatch(new NextRequest("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "DONE" }) }), { params: Promise.resolve({ id: g.id }) });
    expect(res.status).toBe(200);
    expect((await prisma.guestRequest.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("DONE");
    expect(await prisma.auditLog.count({ where: { roomId: ids["201"], action: "GUEST_REQUEST_UPDATED" } })).toBe(1);
  });

  it("Supervisor-Karte listet auch Zimmer mit Anreise, zählt sie aber nicht als Reinigung", async () => {
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: ids["201"], cleaningType: "DEPARTURE" } });
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: ids["202"], cleaningType: "ARRIVAL" } });
    const o = await getLiveOverview();
    const s = o.supervisors.find((x) => x.name === "sup")!;
    expect(s.list.map((r) => `${r.number}:${r.kind}`)).toEqual(["201:DEPARTURE", "202:ARRIVAL"]);
    expect(s.rooms).toBe(1); // nur das Abreise-Zimmer wird gereinigt
  });
});
