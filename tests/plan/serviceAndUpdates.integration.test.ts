import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** „Zimmer und Service heute“ + „jeder wird bei Updates seiner Liste benachrichtigt“ — Wegwerf-DB, erfundene Daten. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-svc-"));
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
import { berlinDate } from "@/lib/dayplan/time";
import { GET as serviceGet } from "@/app/api/lists/service/route";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { notifyListUpdate } from "@/lib/rooms/notifyListUpdate";
import { serviceOf, needsCleaning } from "@/lib/lists/serviceOverview";

const DATE = berlinDate(new Date());
const ids: Record<string, string> = {};
const room: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const inbox = async (key: string, role: string) => { as(key, role); return (await (await notificationsGet()).json()).notifications as { type: string; message: string }[]; };

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (k: string, role: string, extra: Record<string, unknown> = {}) => { ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, ...extra } })).id; };
  await user("hkA", "room_attendant"); await user("hkB", "room_attendant"); await user("hm", "houseman");
  await user("sup1", "supervisor", { assignedFloors: "1" }); await user("sup2", "supervisor", { assignedFloors: "2" }); await user("dm", "duty_manager");
  const defs: [string, number, string, boolean, boolean, string | null][] = [
    ["101", 1, "TURN", false, true, ids.hkA], ["102", 1, "DEPARTURE", false, false, null], ["103", 1, "STAYOVER", true, false, ids.hkA], ["104", 1, "STAYOVER", false, false, null], ["105", 1, "ARRIVAL", false, false, null], ["201", 2, "STAYOVER", false, false, ids.hkB],
  ];
  for (const [n, floor, kind, laundry, vip, hk] of defs) {
    const r = await prisma.room.create({ data: { number: n, floor, section: `${floor}A`, type: n === "102" ? "SUITE" : "STANDARD", isAntiAllergic: n === "104", assignedToId: hk, assignedOn: hk ? DATE : null } });
    room[n] = r.id;
    await prisma.dayRoomPlan.create({ data: { date: DATE, roomId: r.id, cleaningType: kind === "TURN" ? "SAME_DAY_TURN" : kind, laundryDue: laundry, vip, eta: kind === "TURN" ? "14:00" : null } });
  }
  await prisma.trace.create({ data: { roomId: room["102"], code: "HK", date: DATE, text: "Twin beds please", dept: "HOUSEMAN", dedupeKey: "s-102", source: "TRACES" } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Zimmer und Service heute", () => {
  it("eine Definition: Turn, Abreise, Bleiber (+ Wäsche), Anreise = keine Reinigung", () => {
    expect(serviceOf("SAME_DAY_TURN", false)).toBe("TURN");
    expect(serviceOf("DEPARTURE", false)).toBe("DEPARTURE");
    expect(serviceOf("STAYOVER", true)).toBe("STAYOVER_LINEN");
    expect(serviceOf("STAYOVER", false)).toBe("STAYOVER");
    expect(needsCleaning(serviceOf("ARRIVAL", false))).toBe(false);
  });

  it("Duty Manager: alles — Zahlen, Besonderheiten (VIP, Allergiker), zugeteilte Kraft; keine Gastnamen, keine Hausmann-Aufgaben", async () => {
    as("dm", "duty_manager");
    const d = await (await serviceGet()).json();
    expect(d.rooms.map((r: { number: string }) => r.number)).toEqual(["101", "102", "103", "104", "105", "201"]);
    expect(d.counts).toMatchObject({ clean: 6, TURN: 1, DEPARTURE: 1, STAYOVER_LINEN: 1, STAYOVER: 2, ARRIVAL: 1, special: 2 }); // VIP 101, Allergiker 104 (Twin 102 ist Hausmann-Aufgabe → nur Hausmann-Liste); Anreise 105 in ein nicht gereinigtes Zimmer (DIRTY) wird mitgereinigt
    const by = (n: string) => d.rooms.find((r: { number: string }) => r.number === n);
    expect(by("101")).toMatchObject({ service: "TURN", vip: true, eta: "14:00", assignedToName: "hkA Test" });
    expect(by("102").extras).toEqual([]);
    expect(by("104")).toMatchObject({ allergy: true, assignedToName: null });
    expect(JSON.stringify(d)).not.toMatch(/guest/i);
  });

  it("Supervisor sieht nur die Zimmer seiner Etagen; Housekeeper dürfen die Übersicht nicht abrufen", async () => {
    as("sup2", "supervisor");
    expect((await (await serviceGet()).json()).rooms.map((r: { number: string }) => r.number)).toEqual(["201"]);
    as("hkA", "room_attendant");
    expect((await serviceGet()).status).toBe(403);
  });
});

describe("Jeder wird bei Updates seiner Liste benachrichtigt", () => {
  it("Nachimport: genau eine Meldung je betroffener Person (Zimmermädchen, Hausmann, Supervisor der Etage, Duty Manager); Handelnde nicht; nie Aufgabentext", async () => {
    const n = await notifyListUpdate({
      date: DATE, actorId: ids.sup1, source: "IMPORT",
      changes: [{ number: "101", floor: 1, roomId: room["101"], from: "STAYOVER", to: "SAME_DAY_TURN" }, { number: "201", floor: 2, roomId: room["201"], from: "DEPARTURE", to: "STAYOVER" }],
      newTraces: [{ number: "102", floor: 1, dept: "HOUSEMAN" }, { number: "103", floor: 1, dept: "HOUSEKEEPING" }],
    });
    expect(n).toBeGreaterThanOrEqual(5);
    const mine = async (k: string, role: string) => (await inbox(k, role)).filter((x) => x.type === "LIST_UPDATED").map((x) => x.message);
    expect(await mine("hkA", "room_attendant")).toEqual(["Nachimport: Deine Liste hat sich geändert — Zimmer 101: Bleiber → Turn; neuer Hinweis in 103."]);
    expect(await mine("hkB", "room_attendant")).toEqual(["Nachimport: Deine Liste hat sich geändert — Zimmer 201: Abreise → Bleiber."]);
    expect(await mine("hm", "houseman")).toEqual(["Nachimport: Deine Hausmann-Liste hat sich geändert — 1 neue Aufgabe (102)."]);
    expect(await mine("sup1", "supervisor")).toEqual([]); // hat es selbst ausgelöst
    expect(await mine("sup2", "supervisor")).toEqual(["Nachimport: Liste deiner Etagen aktualisiert — 1 Zimmer mit geänderter Art (201)."]);
    expect((await mine("dm", "duty_manager")).length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(await prisma.notification.findMany({ where: { type: "LIST_UPDATED" } }))).not.toMatch(/Twin beds/);
  });

  it("derselbe Stand erneut → keine Doppelten; ohne Änderungen → keine Meldung", async () => {
    const before = await prisma.notification.count({ where: { type: "LIST_UPDATED" } });
    await notifyListUpdate({ date: DATE, actorId: ids.sup1, source: "IMPORT", changes: [{ number: "201", floor: 2, roomId: room["201"], from: "DEPARTURE", to: "STAYOVER" }], newTraces: [] });
    expect(await prisma.notification.count({ where: { type: "LIST_UPDATED", targetUserId: ids.hkB } })).toBe(1);
    expect(await notifyListUpdate({ date: DATE, actorId: null, source: "MANUAL", changes: [], newTraces: [] })).toBe(0);
    expect(await prisma.notification.count({ where: { type: "LIST_UPDATED" } })).toBeGreaterThanOrEqual(before);
  });
});
