import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Arbeitsdaten gegen eine Wegwerf-DB: Zuordnung zur Reinigungsart, 90-Tage-Fenster, Schalter. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-workdata-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { loadWorkData, planningMinutesFor, setUsePlanningFlag, statsFor } from "@/lib/workdata/load";

const TODAY = "2026-11-02";
let hkId = "";

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Arbeitsdaten (Wegwerf-DB)", () => {
  it("misst je Reinigungsart nur innerhalb des Aufbewahrungsfensters", async () => {
    hkId = (await prisma.user.create({ data: { email: "a@t", name: "A", passwordHash: "x", role: "room_attendant" } })).id;
    const room = await prisma.room.create({ data: { number: "101", floor: 1, section: "1A", type: "STANDARD" } });
    const add = async (day: string, minutes: number, kind: string) => {
      await prisma.dayRoomPlan.create({ data: { date: day, roomId: room.id, cleaningType: kind } });
      const start = new Date(`${day}T08:00:00Z`);
      await prisma.auditLog.create({ data: { action: "STATUS_CHANGE", userId: hkId, roomId: room.id, toStatus: "IN_PROGRESS", createdAt: start } });
      await prisma.auditLog.create({ data: { action: "STATUS_CHANGE", userId: hkId, roomId: room.id, toStatus: "CLEAN", createdAt: new Date(start.getTime() + minutes * 60_000) } });
    };
    for (const [i, m] of [20, 22, 24, 26, 28].entries()) await add(`2026-10-2${i}`, m, "DEPARTURE");
    await add("2026-07-01", 99, "DEPARTURE"); // älter als 90 Tage → zählt nicht
    const set = await loadWorkData(TODAY);
    const s = statsFor(set, hkId);
    expect(s.byCategory.DEPARTURE).toMatchObject({ n: 5, median: 24, enough: true });
    expect(s.samples).toBe(5);
  });

  it("Schalter aus → Planung nutzt keine Messdaten", async () => {
    expect(Object.keys(await planningMinutesFor(TODAY, [hkId]))).toEqual([hkId]);
    await setUsePlanningFlag(false, hkId);
    expect(await planningMinutesFor(TODAY, [hkId])).toEqual({});
  });
});
