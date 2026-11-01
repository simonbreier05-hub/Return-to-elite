import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Lernen aus Planungsänderungen gegen eine Wegwerf-DB: Abweichungen → Muster → Vorschlag; Schalter; Stufe-1-Regel gewinnt. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-learning-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
vi.mock("@/lib/realtime", () => ({ broadcast: () => undefined }));

import { prisma } from "@/lib/db";
import { deletePattern, listPatterns, recordFloorDeviations, recordRoomDeviations, setLearningEnabled, setPatternActive } from "@/lib/learning/store";
import { loadDay } from "@/lib/autoplan/load";

const TODAY = "2026-11-02";
const ids: Record<string, string> = {};

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Lernen (Wegwerf-DB)", () => {
  it("bereitet Team und Zimmer vor", async () => {
    const mk = async (k: string, role: string, level = 2) => { ids[k] = (await prisma.user.create({ data: { email: `${k}@t`, name: k, passwordHash: "x", role, hkLevel: level } })).id; };
    await mk("sup", "supervisor"); await mk("a", "room_attendant", 2); await mk("b", "room_attendant", 3); await mk("c", "room_attendant", 1);
    for (const [n, type] of [["410", "SUITE"], ["101", "STANDARD"]] as const) {
      const r = await prisma.room.create({ data: { number: n, floor: Number(n[0]), section: `${n[0]}A`, type } });
      await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: r.id, cleaningType: "STAYOVER" } });
    }
  });

  it("Zimmer 410 an 3 von 5 Tagen von A zu B verschoben → Muster, fließt als Präferenz ein", async () => {
    for (const d of ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]) {
      await prisma.autoPlanProposal.create({ data: { date: d, status: "CONFIRMED", createdById: ids.sup, confirmedAt: new Date(), payload: JSON.stringify({ input: { housekeepers: [1, 2, 3], rooms: [] }, result: { assignment: {} } }) } });
    }
    for (const d of ["2026-10-29", "2026-10-31", "2026-11-01"]) await recordRoomDeviations(d, [{ room: "410", from: ids.a, to: ids.b }], 3);
    const p = await listPatterns(TODAY);
    expect(p.map((x) => x.key).sort()).toEqual([`ROOML|410|3`, `ROOMP|410|${ids.b}`]);
    const day = await loadDay(TODAY);
    const r = day.rooms.find((x) => x.number === "410")!;
    expect(r.preferHk).toBe(ids.b);
    expect(r.minLevel).toBe(3);
    expect(r.learnedReason).toMatch(/gelernt: an 3 von 5/);
  });

  it("Tag mit viel weniger Personal zählt nicht (Gewicht 0)", async () => {
    await recordRoomDeviations(TODAY, [{ room: "101", from: ids.a, to: ids.b }], 1);
    const row = await prisma.planDeviation.findFirst({ where: { roomNumber: "101" } });
    expect(row?.weight).toBe(0);
  });

  it("Muster aus, Gesamtschalter aus, Löschen", async () => {
    await setPatternActive(`ROOMP|410|${ids.b}`, false, ids.sup);
    expect((await loadDay(TODAY)).rooms.find((x) => x.number === "410")!.preferHk).toBeUndefined();
    await setPatternActive(`ROOMP|410|${ids.b}`, true, ids.sup);
    await setLearningEnabled(false, ids.sup);
    expect((await listPatterns(TODAY)).every((p) => !p.active)).toBe(true);
    await setLearningEnabled(true, ids.sup);
    await deletePattern(`ROOMP|410|${ids.b}`, TODAY, ids.sup);
    expect((await listPatterns(TODAY)).map((p) => p.key)).toEqual([`ROOML|410|3`]);
    const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: "LEARN" } } });
    for (const l of logs) expect(l.meta ?? "").not.toMatch(/"name"|hkLevel/);
  });

  it("Stufe-1-Regel gewinnt: Muster für anspruchsvolles Zimmer an Stufe 1 wird nicht angewendet, nur Hinweis", async () => {
    for (const d of ["2026-10-30", "2026-10-31", "2026-11-01"]) {
      await prisma.planDeviation.create({ data: { date: d, kind: "ROOM_MOVED", roomNumber: "410", before: ids.b, after: ids.c, weight: 1 } });
    }
    const day = await loadDay(TODAY);
    expect(day.rooms.find((x) => x.number === "410")!.preferHk).not.toBe(ids.c);
    expect(day.learnedNotes.join(" ")).toMatch(/Zimmer 410.*Stufe-1-Regel/);
  });

  it("Etagen: Vorschlag ≠ gespeichert → Abweichung FLOOR_CHANGED", async () => {
    const n = await recordFloorDeviations(TODAY, [{ userId: ids.a, floor: 3 }, { userId: ids.b, floor: 1 }], { [ids.a]: [2], [ids.b]: [1] }, 3);
    expect(n).toBe(1);
    expect(await prisma.planDeviation.findFirst({ where: { kind: "FLOOR_CHANGED" } })).toMatchObject({ personId: ids.a, before: "3", after: "2" });
  });
});
