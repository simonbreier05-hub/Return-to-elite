import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Etagenzuweisung für das ganze Team gegen eine Wegwerf-DB: Historie → Vorschlag → Speichern → Audit → Autoplan. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-floorteam-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
vi.mock("@/lib/realtime", () => ({ broadcast: () => undefined }));

import { prisma } from "@/lib/db";
import { getFloorTeamState, saveFloorTeam } from "@/lib/planung/floorTeamData";
import { loadDay } from "@/lib/autoplan/load";

const DATE = "2026-11-02";
const ids: Record<string, string> = {};

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Etagenzuweisung Team (Wegwerf-DB)", () => {
  it("bereitet Team, Zimmer, Tagesplan und Einsatz-Historie vor", async () => {
    const mk = async (key: string, role: string, extra: Record<string, unknown> = {}) => {
      ids[key] = (await prisma.user.create({ data: { email: `${key}@t`, name: key.toUpperCase(), passwordHash: "x", role, ...extra } })).id;
    };
    await mk("sup", "supervisor", { assignedFloors: "1,2,3,4,5" });
    await mk("anna", "room_attendant", { hkLevel: 3 });
    await mk("ben", "room_attendant", { hkLevel: 1, hkType: "TEILZEIT" });
    await mk("neu", "room_attendant");
    await mk("hm", "houseman");
    const rooms: Record<string, string> = {};
    for (const f of [1, 2, 3, 4, 5]) for (let n = 1; n <= 6; n++) {
      const number = `${f}${String(n).padStart(2, "0")}`;
      rooms[number] = (await prisma.room.create({ data: { number, floor: f, section: `${f}A`, type: "STANDARD", status: "DIRTY" } })).id;
      await prisma.dayRoomPlan.create({ data: { date: DATE, roomId: rooms[number], cleaningType: "STAYOVER" } });
    }
    await prisma.setting.create({ data: { key: "planningTeam", value: JSON.stringify({ date: DATE, hk: [ids.anna, ids.ben, ids.neu], sup: [ids.sup], hm: [ids.hm] }) } });
    // Anna: an 4 der letzten 5 Einsatztage auf Etage 2; Ben: 2× Etage 4 (zu wenig)
    const at = (d: string) => new Date(`${d}T09:00:00Z`);
    for (const [d, f] of [["2026-10-27", 2], ["2026-10-28", 2], ["2026-10-29", 3], ["2026-10-30", 2], ["2026-11-01", 2]] as const) {
      await prisma.auditLog.create({ data: { action: "STATUS_CHANGE", userId: ids.anna, roomId: rooms[`${f}01`], toStatus: "CLEAN", createdAt: at(d) } });
    }
    for (const d of ["2026-10-30", "2026-11-01"]) await prisma.auditLog.create({ data: { action: "STATUS_CHANGE", userId: ids.ben, roomId: rooms["401"], toStatus: "CLEAN", createdAt: at(d) } });
    // Nur angefangen (IN_PROGRESS) zählt nicht als Einsatz
    for (const d of ["2026-10-28", "2026-10-29", "2026-10-30"]) await prisma.auditLog.create({ data: { action: "STATUS_CHANGE", userId: ids.ben, roomId: rooms["501"], toStatus: "IN_PROGRESS", createdAt: at(d) } });
  });

  it("schlägt Etagen aus tatsächlichen Einsätzen vor (3 von 5), neue Person ohne Vorschlag", async () => {
    const s = await getFloorTeamState(DATE);
    // F9 (N3, Simon 20.11.): Housekeeper werden hier nicht mehr eingeteilt — nur Supervisor und Hausmann
    expect(s.people.map((p) => p.role).sort()).toEqual(["HM", "SUP"]);
    expect(s.loads.find((l) => l.floor === 2)?.rooms).toBe(6);
    expect(s.suggestions).toEqual([]); // Annas Einsätze erzeugen keinen Etagen-Vorschlag mehr
    expect(s.assign[ids.sup]).toEqual([1, 2, 3, 4, 5]); // bestehende Supervisor-Etagen laufen unverändert weiter
  });

  it("Speichern: jede Etage braucht einen Supervisor", async () => {
    await expect(saveFloorTeam(DATE, { [ids.sup]: [1, 2, 3, 4] }, ids.sup)).rejects.toThrow(/Etage 5/);
  });

  it("F9 (N3): Housekeeper lassen sich hier nicht mehr einteilen", async () => {
    await expect(saveFloorTeam(DATE, { [ids.sup]: [1, 2, 3, 4, 5], [ids.anna]: [2] }, ids.sup)).rejects.toThrow(/Supervisoren und Hausmänner/);
  });

  it("Speichern schreibt Etagen + Tag, protokolliert vorher/nachher ohne Namen", async () => {
    const r = await saveFloorTeam(DATE, { [ids.sup]: [1, 2, 3, 4, 5], [ids.hm]: [1, 2, 3] }, ids.sup);
    expect(r.changed).toBe(1);
    const hm = await prisma.user.findUnique({ where: { id: ids.hm } });
    expect(hm).toMatchObject({ assignedFloors: "1,2,3", floorsOn: DATE });
    const logs = await prisma.auditLog.findMany({ where: { action: "FLOOR_TEAM_ASSIGNED" } });
    expect(logs).toHaveLength(1);
    for (const l of logs) expect(l.meta).not.toMatch(/ANNA|BEN|HM|hkLevel|level/);
    expect(JSON.parse(logs[0].meta!)).toMatchObject({ before: [], after: [1, 2, 3], role: "houseman" });
  });

  it("F9 (N2/N3): Vorschlag nutzt Präferenz-Etagen statt Etagenzuweisung; Obergrenze = Zimmervorgabe ≤ feste Obergrenze", async () => {
    await prisma.user.update({ where: { id: ids.anna }, data: { homeFloors: "2", assignedFloors: "4", floorsOn: DATE } });
    const d = await loadDay(DATE);
    const anna = d.hks.find((h) => h.id === ids.anna)!;
    expect(anna.todayFloors).toBeUndefined(); // eine alte Etagenzuweisung wirkt nicht mehr
    expect(anna.homeFloors).toEqual([2]);
    expect(anna).toMatchObject({ roomsLo: 10, roomsHi: 11, cap: 11 }); // Planung L1: Vollzeit-Ziel 11 (10–11)
    await prisma.setting.create({ data: { key: "roomsPerAttendantMax", value: "9" } });
    expect((await loadDay(DATE)).hks.find((h) => h.id === ids.anna)!.cap).toBe(9);
    await prisma.setting.delete({ where: { key: "roomsPerAttendantMax" } });
  });
});
