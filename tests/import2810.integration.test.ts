import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 28.10.2026 gegen eine Wegwerf-SQLite-DB: fünf Opera-Listen (Nachbau, erfundene Namen) → Import → Tagesplan → Board.
 * Alle Zähler (Tageszahlen, „Zimmer und Service heute“, Entwurf/Autoplan) kommen aus derselben Regel und stimmen überein;
 * Liste löschen und neu einlesen funktioniert in derselben Sitzung.
 */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-2810-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { FLOORS, roomNumbersForFloor } from "@/lib/domain";
import { applyDayPlanToBoard, mergeDay } from "@/lib/dayplan/merge";
import { getDayNumbers } from "@/lib/dayplan/dayNumbersData";
import { loadList, parseList } from "@/lib/import/readFile";
import { applyBatch, listBlockersNow, sha256, storeBatch } from "@/lib/import/store";
import { deleteAppliedList } from "@/lib/import/deleteList";
import { getPlausibility } from "@/lib/import/plausibilityData";
import { getServiceOverview } from "@/lib/lists/serviceOverview";
import { loadDay } from "@/lib/autoplan/load";
import type { ImportType } from "@/lib/domain";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-28T09:00:00Z"));
const DAY = "2026-10-28";
const DIR = join(__dirname, "fixtures/opera/2026-10-28");
const FILES: [string, ImportType][] = [["forecast_28-10-26.pdf", "FORECAST"], ["departures_28-10-26.pdf", "DEPARTURES"], ["arrivals_28-10-26.pdf", "ARRIVALS"],
  ["traces_28-10-26.pdf", "TRACES"], ["inhouse_28-10-26.pdf", "INHOUSE"]];
let userId = "";

async function importFile(name: string, type: ImportType) {
  const bytes = new Uint8Array(readFileSync(join(DIR, name)));
  const result = parseList(type, await loadList(name, bytes), { today: DAY, expectedDate: DAY, roomInventory: 145 });
  const known = new Set((await prisma.room.findMany({ select: { number: true } })).map((r) => r.number));
  const { batch, critical, issues } = await storeBatch({ result, uploadedById: userId, fileHash: sha256(bytes), knownRooms: known });
  expect(critical, `${type}: ${issues.map((i) => i.code).join(",")}`).toBe(false);
  await applyBatch(batch.id, userId);
}

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  userId = (await prisma.user.create({ data: { email: "dm@x.test", name: "dm", passwordHash: "x", role: "duty_manager" } })).id;
  for (const f of FLOORS as number[]) for (const n of roomNumbersForFloor(f)) {
    await prisma.room.create({ data: { number: n, floor: f, section: `${f}A`, type: "STANDARD", status: n === "112" || n === "222" ? "OUT_OF_ORDER" : "INSPECTED", statusSince: new Date("2026-10-27T08:00:00Z") } });
  }
}, 120_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

async function expectFullDay() {
  const { numbers } = await getDayNumbers(DAY);
  expect(numbers).toMatchObject({ inventory: 145, occupied: 113, toClean: 101, byKind: { STAYOVER: 75, DEPARTURE: 14, TURN: 12, ARRIVAL: 0 } });
  const service = await getServiceOverview({ userId, role: "duty_manager" });
  expect(service.counts.clean).toBe(numbers.toClean);
  const dd = await loadDay(DAY);
  expect(dd.rooms).toHaveLength(numbers.toClean); // Entwurf/Credits über alle zu reinigenden Zimmer
}

describe("28.10.2026: fünf Listen → ein Tagesplan, gleiche Zahlen überall", () => {
  it("alle fünf Listen übernommen, Gate offen", async () => {
    for (const [name, type] of FILES) await importFile(name, type);
    expect((await listBlockersNow()).missing).toEqual([]);
  }, 60_000);

  it("Tagesplan: 113 von 145 belegt, 101 zu reinigen (75 Bleiber + 14 Abreisen + 12 Turns); Board, Service-Übersicht und Entwurf identisch", async () => {
    const r = await mergeDay(DAY, userId);
    await applyDayPlanToBoard(DAY, userId);
    expect(r.figures).toEqual({ departures: 26, arrivals: 38, stayovers: 75, eveningOccupancy: 113, cleaningCount: 101 });
    expect(r.issues.map((i) => i.code)).not.toContain("FORECAST_MISMATCH");
    // Anreise-Zimmer (RESV) werden nicht schmutzig gesetzt und gelten morgens nicht als belegt
    const resvRoom = await prisma.room.findFirst({ where: { dayPlans: { some: { date: DAY, cleaningType: "ARRIVAL" } } } });
    expect(resvRoom).toMatchObject({ status: "INSPECTED", occupancy: "VACANT" });
    await expectFullDay();
  });

  it("Plausibilität: Listen und Forecast passen → keine Warnung", async () => {
    expect((await getPlausibility(DAY)).findings).toEqual([]);
  });

  it("In-House löschen → Gate zu; neu einlesen in derselben Sitzung → wieder vollständig", async () => {
    await deleteAppliedList("INHOUSE", DAY, userId, { keepPlan: true });
    expect((await listBlockersNow()).missing).toEqual(["INHOUSE"]);
    await importFile("inhouse_28-10-26.pdf", "INHOUSE"); // dieselbe Datei erneut
    expect((await listBlockersNow()).missing).toEqual([]);
    await mergeDay(DAY, userId);
    await applyDayPlanToBoard(DAY, userId);
    await expectFullDay();
    expect((await getPlausibility(DAY)).findings).toEqual([]);
  }, 60_000);
});
