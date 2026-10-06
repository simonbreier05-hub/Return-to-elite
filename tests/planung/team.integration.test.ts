import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-team-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn() }));
import { prisma } from "@/lib/db";
import { getTeamState, saveFloors, saveTeam } from "@/lib/planung/teamData";

const D = "2026-09-22";
const ids: Record<string, string> = {};
const mk = async (key: string, name: string, role: string, extra: Record<string, unknown> = {}) => {
  ids[key] = (await prisma.user.create({ data: { email: `${key}@x.test`, name, passwordHash: "x", role, ...extra } })).id;
};

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await mk("h1", "Hanna Eins", "room_attendant", { hkType: "VOLLZEIT", hkLevel: 3 });
  await mk("h2", "Hilde Zwei", "room_attendant", { hkType: "TEILZEIT", hkLevel: 2 });
  await mk("h3", "Hella Drei", "room_attendant", { hkType: "AZUBI", hkLevel: 1, dailyTarget: 10 });
  await mk("s1", "Petra Sup", "supervisor", { assignedFloors: "1,2" });
  await mk("s2", "Jonas Sup", "supervisor", { assignedFloors: "3" });
  await mk("m1", "Hans Mann", "houseman");
  // 1 Zimmer Abreise (1 Credit), 1 Bleiber (0,7 laut Einstellung) → Bedarf ≈ 1,7 mit Standardzimmer
  for (const [n, f, t] of [["101", 1, "DEPARTURE"], ["102", 1, "STAYOVER"]] as const) {
    const r = await prisma.room.create({ data: { number: n, floor: f, section: "1A", type: "STANDARD" } });
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: r.id, cleaningType: t } });
  }
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Team speichern", () => {
  it("Vorbelegung ohne Speicherstand: alle; Bedarf aus dem Tagesplan; Ziel je Housekeeper", async () => {
    const s = await getTeamState(D);
    expect(s.source).toBe("default");
    expect(s.hasPlan).toBe(true);
    expect(s.demand.rooms).toBe(2);
    expect(s.demand.credits).toBeGreaterThan(1);
    expect(s.selected.hk).toHaveLength(3);
    expect(s.members.hk.find((h) => h.id === ids.h3)!.target).toBe(10); // dailyTarget überschreibt die Typ-Spanne
    expect(s.floorAssign[1]).toBe(ids.s1);
    expect(s.floorAssign[3]).toBe(ids.s2);
  });

  it("speichert heute anwesend: Nicht-Gewählte sind heute abwesend, Gewählte nicht", async () => {
    await prisma.user.update({ where: { id: ids.h1 }, data: { absentDate: D } }); // war krank gemeldet, jetzt gewählt
    await saveTeam(D, { hk: [ids.h1, ids.h2], sup: [ids.s1], hm: [] }, ids.s1);
    const u = Object.fromEntries((await prisma.user.findMany()).map((x) => [x.id, x.absentDate]));
    expect(u[ids.h1]).toBeNull();
    expect(u[ids.h2]).toBeNull();
    expect(u[ids.h3]).toBe(D);
    const s = await getTeamState(D);
    expect(s.source).toBe("today");
    expect(s.selected).toEqual({ hk: [ids.h1, ids.h2], sup: [ids.s1], hm: [] });
    expect(s.floorAssign[3]).toBeNull(); // s2 ist nicht gewählt → Etage 3 ist wieder offen
  });

  it("nächster Tag: Auswahl vom Vortag, aber wer heute abwesend gemeldet ist, ist nicht vorgewählt", async () => {
    await prisma.user.update({ where: { id: ids.h2 }, data: { absentDate: "2026-09-23" } });
    const s = await getTeamState("2026-09-23");
    expect(s.source).toBe("previous");
    expect(s.selected.hk).toEqual([ids.h1]);
  });

  it("lehnt fremde Rollen ab", async () => {
    await expect(saveTeam(D, { hk: [ids.s1], sup: [ids.s1], hm: [] }, ids.s1)).rejects.toThrow();
  });

  it("Audit enthält nur Zahlen, keine Namen, Typ oder Stufe", async () => {
    const log = await prisma.auditLog.findFirst({ where: { action: "PLANNING_TEAM_SAVED" } });
    const meta = JSON.parse(log!.meta ?? "{}");
    expect(meta).toEqual({ date: D, hk: 2, sup: 1, hm: 0 });
  });
});

describe("Etagen speichern", () => {
  it("braucht jede Etage und nur gewählte Supervisoren", async () => {
    await expect(saveFloors(D, { 1: ids.s1, 2: ids.s1, 3: ids.s1, 4: ids.s1, 5: ids.s2 }, ids.s1)).rejects.toThrow(/gewählte/);
    await expect(saveFloors(D, { 1: ids.s1, 2: ids.s1, 3: ids.s1, 4: ids.s1 } as never, ids.s1)).rejects.toThrow(/Etage 5/);
  });
  it("schreibt in die bestehende Zuweisung und räumt andere Supervisoren ab", async () => {
    await saveFloors(D, { 1: ids.s1, 2: ids.s1, 3: ids.s1, 4: ids.s1, 5: ids.s1 }, ids.s1);
    const u = Object.fromEntries((await prisma.user.findMany({ where: { role: "supervisor" } })).map((x) => [x.id, x.assignedFloors]));
    expect(u[ids.s1]).toBe("1,2,3,4,5");
    expect(u[ids.s2]).toBe(""); // war Etage 3, heute nicht im Team
    const s = await getTeamState(D);
    expect(Object.values(s.floorAssign).every((x) => x === ids.s1)).toBe(true);
  });
  it("ohne gespeichertes Team für den Tag: Fehler", async () => {
    await expect(saveFloors("2026-10-01", { 1: ids.s1, 2: ids.s1, 3: ids.s1, 4: ids.s1, 5: ids.s1 }, ids.s1)).rejects.toThrow(/Team/);
  });
});
