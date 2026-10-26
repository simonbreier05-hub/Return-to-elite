import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-hub-"));
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
import { GET as roomsGet } from "@/app/api/rooms/route";
import { GET as priorityGet } from "@/app/api/priority/route";
import { applyDayPlanToBoard, mergeDay } from "@/lib/dayplan/merge";
import { hubDay } from "@/lib/dayplan/hubDay";

// Betriebstag = heute (Berlin); Uhr fest, damit „gestern“ eindeutig ist.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
const D = "2026-09-22", YESTERDAY = "2026-09-21";
const ids: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const rooms = async (q = "") => (await roomsGet(new NextRequest(`http://x/api/rooms${q}`))).json();

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["anna", "room_attendant"], ["sup", "supervisor"], ["dm", "duty_manager"]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  }
  // Alter Board-Stand von gestern (Demo/Vortag): Abreise, belegt, Anna zugeteilt, Anreise erwartet
  for (const n of ["201", "202", "203"]) {
    const r = await prisma.room.create({ data: { number: n, floor: 2, section: "2A", type: "STANDARD", isCheckoutToday: true, occupancy: "OCCUPIED", assignedToId: ids.anna, assignedOn: YESTERDAY, routeOrder: 1 } });
    ids[n] = r.id;
  }
  await prisma.arrival.create({ data: { roomId: ids["201"], guestName: "Frau Probe", status: "EXPECTED", createdById: ids.sup } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Ohne Tagesplan für heute: keine Tagesdaten", () => {
  it("Board, Grundriss und „Meine Zimmer“ sind leer und melden hub.ready=false", async () => {
    expect(await hubDay()).toEqual({ date: D, ready: false });
    as("sup", "supervisor");
    for (const q of ["", "?allFloors=1"]) {
      const body = await rooms(q);
      expect(body.rooms).toEqual([]);
      expect(body.hub).toEqual({ date: D, ready: false });
    }
    as("anna", "room_attendant");
    expect((await rooms("?mine=1")).rooms).toEqual([]);
  });

  it("Schnellsuche findet Zimmer, aber ohne Abreise, Zuteilung oder Anreise von gestern", async () => {
    as("sup", "supervisor");
    const [r] = (await rooms("?q=201")).rooms;
    expect(r).toMatchObject({ number: "201", isCheckoutToday: false, assignedToId: null, assignedTo: null, arrivals: [] });
  });

  it("Priorität: nichts zu priorisieren", async () => {
    as("anna", "room_attendant");
    const body = await (await priorityGet(new NextRequest("http://x/api/priority"))).json();
    expect(body.priorities).toEqual([]);
  });
});

describe("Mit Tagesplan aus dem Planungshub", () => {
  it("Board übernimmt Belegung/Abreise aus Tagesplan + In-House-Liste; alte Werte verschwinden", async () => {
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: ids["201"], cleaningType: "STAYOVER" } });
    // In-House-Liste: 202 belegt; 203 steht nirgends → frei
    await prisma.importBatch.create({ data: { type: "INHOUSE", status: "APPLIED", businessDate: D, fileHash: "ih", appliedAt: new Date(), uploadedById: ids.sup, rowCount: 1,
      rows: { create: [{ kind: "INHOUSE", room: "202", payload: JSON.stringify({ room: "202" }) }] } } });
    await applyDayPlanToBoard(D, ids.sup);
    const byNo = Object.fromEntries((await prisma.room.findMany()).map((r) => [r.number, r]));
    expect(byNo["201"]).toMatchObject({ isCheckoutToday: false, occupancy: "OCCUPIED" });
    expect(byNo["202"]).toMatchObject({ isCheckoutToday: false, occupancy: "OCCUPIED" });
    expect(byNo["203"]).toMatchObject({ isCheckoutToday: false, occupancy: "VACANT" });
    expect(await hubDay()).toEqual({ date: D, ready: true });
  });

  it("Zuteilungen von gestern zählen nicht, heutige schon (Board und „Meine Zimmer“)", async () => {
    await prisma.room.update({ where: { id: ids["202"] }, data: { assignedOn: D } });
    as("sup", "supervisor");
    const board = await rooms();
    expect(board.hub.ready).toBe(true);
    const assigned = Object.fromEntries(board.rooms.map((r: { number: string; assignedToId: string | null }) => [r.number, r.assignedToId]));
    expect(assigned).toEqual({ "201": null, "202": ids.anna, "203": null });
    as("anna", "room_attendant");
    expect((await rooms("?mine=1")).rooms.map((r: { number: string }) => r.number)).toEqual(["202"]);
  });

  it("Tagesplan nimmt eine im Hub als veraltet bestätigte Departures-Liste, nie eine unbestätigte ältere", async () => {
    await prisma.importBatch.create({ data: { type: "DEPARTURES", status: "APPLIED", businessDate: YESTERDAY, fileHash: "d-old", appliedAt: new Date(), uploadedById: ids.sup, rowCount: 0 } });
    await expect(mergeDay(D, ids.sup)).rejects.toThrow(/keine Departures/);
    await prisma.importBatch.updateMany({ where: { fileHash: "d-old" }, data: { staleAcceptedAt: new Date(), staleAcceptedById: ids.sup } });
    await expect(mergeDay(D, ids.sup)).resolves.toMatchObject({ date: D });
  });
});

describe("Start-Skript (Seed) legt keine Tagesdaten an", () => {
  it("nur Mitarbeiter, Zimmer-Stammdaten, Etagen-Einrichtungen und Einstellungen", () => {
    const seed = readFileSync("prisma/seed.ts", "utf8");
    for (const model of ["arrival", "stay", "excursion", "defect", "workOrder", "roomTask", "roomNote", "guestRequest"]) {
      expect(seed, model).not.toMatch(new RegExp(`prisma\\.${model}\\.create`));
    }
    expect(seed).not.toMatch(/assignedToId:|isCheckoutToday:|occupancy:|prisma\.room\.update/);
  });
});
