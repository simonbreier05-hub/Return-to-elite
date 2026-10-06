import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Durchlauf gegen eine echte (Wegwerf-)SQLite-DB: Beispiel-PDFs → Import → Zusammenführung → Board.
 * Prüft Idempotenz, Zuteilungen bleiben fest, Hinweise bei Nachimport, Datenschutz-Whitelist.
 */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-dayplan-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { applyDayPlanToBoard, mergeDay, overrideCleaningType } from "@/lib/dayplan/merge";
import * as build from "@/lib/import/sample/build";
import { todayScenario, TEST_CARD } from "@/lib/import/sample/scenario";
import { loadList, parseList } from "@/lib/import/readFile";
import { applyBatch, sha256, storeBatch } from "@/lib/import/store";

const TODAY = "2026-10-06";
const ROOMS = Array.from({ length: 20 }, (_, i) => String(101 + i));
const sc = todayScenario(TODAY, ROOMS, 145);
let userId = "";

async function importAll(opts: { skip?: string[] } = {}) {
  const files: [string, Uint8Array, Parameters<typeof parseList>[0]][] = [
    ["res_detail.pdf", await build.buildArrivalsPdf(sc), "ARRIVALS"],
    ["departure_all.pdf", await build.buildDeparturesPdf(sc), "DEPARTURES"],
    ["history_forecast.pdf", await build.buildForecastPdf(sc), "FORECAST"],
    ["traces_all.pdf", await build.buildTracesPdf(sc), "TRACES"],
  ];
  const known = new Set((await prisma.room.findMany()).map((r) => r.number));
  for (const [name, bytes, type] of files) {
    if (opts.skip?.includes(type)) continue;
    const result = parseList(type, await loadList(name, bytes), { today: TODAY });
    const { batch, critical } = await storeBatch({ result, uploadedById: userId, fileHash: sha256(bytes), knownRooms: known });
    expect(critical, `${type} kritisch`).toBe(false);
    await applyBatch(batch.id, userId);
  }
}

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Tagesplan aus Import (Wegwerf-DB)", () => {
  it("bereitet Nutzer und Zimmer vor", async () => {
    userId = (await prisma.user.create({ data: { email: "sup@test", name: "Sup", passwordHash: "x", role: "supervisor" } })).id;
    for (const n of ROOMS) await prisma.room.create({ data: { number: n, floor: 1, section: "1A", type: "STANDARD" } });
    await prisma.room.create({ data: { number: "130", floor: 1, section: "1A", type: "STANDARD", occupancy: "OCCUPIED", isCheckoutToday: true } });
    await importAll();
  }, 60_000);

  it("leitet Arten, Zahlen und Aufenthalte ab", async () => {
    const r = await mergeDay(TODAY, userId);
    expect(r.figures).toEqual({ departures: 5, arrivals: 10, stayovers: 6, eveningOccupancy: 16, cleaningCount: 11 });
    expect(r.counts.stays).toBe(21);
    const plan = await prisma.dayRoomPlan.findMany({ where: { date: TODAY } });
    const by = (t: string) => plan.filter((p) => p.cleaningType === t).length;
    expect([by("DEPARTURE"), by("SAME_DAY_TURN"), by("STAYOVER"), by("ARRIVAL")]).toEqual([4, 1, 6, 9]);
    expect(await prisma.stay.count({ where: { source: "IMPORT", status: "IN_HOUSE" } })).toBe(14); // Abreisen + Bleiber + Frühanreisen
    // Forecast-Gegenprobe und Pflege der Traces
    expect(r.issues.map((i) => i.code)).toContain("FORECAST_MISMATCH"); // Beispiel-Forecast passt absichtlich nicht zum Haus mit 20 Zimmern
    expect(await prisma.trace.count()).toBeGreaterThanOrEqual(5);
  });

  it("Twin/Zusatzbett → Hausmann-Aufgaben; Rückbau nur weil das Zimmer heute abreist; keine Dubletten", async () => {
    const tasks = await prisma.roomTask.findMany({ include: { room: true } });
    expect(tasks.map((t) => `${t.room.number}:${t.type}`).sort()).toEqual(["102:TWIN_REVERT", "106:TWIN_SETUP", "116:SONSTIGES", "118:SONSTIGES"]);
  });

  it("Stay: Schlüssel Zimmer + Anreise, Token vorhanden, Name nur Anrede + Nachname", async () => {
    const stays = await prisma.stay.findMany({ include: { room: true } });
    expect(new Set(stays.map((s) => `${s.room.number}|${s.checkIn.toISOString().slice(0, 10)}`)).size).toBe(stays.length);
    expect(stays.every((s) => s.stayToken.length >= 20 && !s.guestName.includes(","))).toBe(true);
  });

  it("zweiter Lauf ändert nichts (idempotent)", async () => {
    const before = [await prisma.stay.count(), await prisma.trace.count(), await prisma.roomTask.count(), await prisma.dayRoomPlan.count()];
    await mergeDay(TODAY, userId);
    expect([await prisma.stay.count(), await prisma.trace.count(), await prisma.roomTask.count(), await prisma.dayRoomPlan.count()]).toEqual(before);
  });

  it("Board: setzt Abreise/Belegung/Anreisen/Wäsche-Zähler; Zimmer ohne Eintrag werden bei vollständigem Zeitraum geleert", async () => {
    const r = await applyDayPlanToBoard(TODAY, userId);
    expect(r.arrivalsCreated).toBe(7); // nur noch nicht eingecheckte Anreisen
    const rooms = Object.fromEntries((await prisma.room.findMany()).map((x) => [x.number, x]));
    expect(rooms["101"]).toMatchObject({ isCheckoutToday: true, occupancy: "OCCUPIED" });
    expect(rooms["130"]).toMatchObject({ isCheckoutToday: false, occupancy: "VACANT" });
    expect(rooms["106"].lastLinenChangeAt).not.toBeNull(); // Bleiber: Zähler ab Anreise
    expect(await prisma.arrival.count({ where: { source: "IMPORT", status: "EXPECTED" } })).toBe(7);
    await applyDayPlanToBoard(TODAY, userId);
    expect(await prisma.arrival.count({ where: { source: "IMPORT", status: "EXPECTED" } })).toBe(7); // ersetzt statt verdoppelt
  });

  it("Nachimport: Zuteilung bleibt fest, Zimmer bekommt Hinweis; fehlender Aufenthalt wird markiert, nicht gelöscht", async () => {
    const attendant = await prisma.user.create({ data: { email: "att@test", name: "Att", passwordHash: "x", role: "room_attendant" } });
    await prisma.room.update({ where: { number: "101" }, data: { assignedToId: attendant.id } });
    // Abreise von Zimmer 101 fällt aus der Liste: Nachimport mit geändertem Stand
    const batch = await prisma.importBatch.findFirstOrThrow({ where: { type: "DEPARTURES", status: "APPLIED" }, include: { rows: true } });
    await prisma.importRow.deleteMany({ where: { batchId: batch.id, room: "101" } });
    const stays = await prisma.stay.count();
    const r = await mergeDay(TODAY, userId);
    expect((await prisma.room.findUniqueOrThrow({ where: { number: "101" } })).assignedToId).toBe(attendant.id);
    expect(r.counts.changedAssigned).toBe(1);
    expect(await prisma.notification.count({ where: { type: "DAY_PLAN_CHANGED", targetRole: "supervisor" } })).toBe(1);
    expect(r.issues.map((i) => i.code)).toContain("STAY_MISSING");
    expect(await prisma.stay.count()).toBe(stays); // nichts gelöscht
    expect(await prisma.stay.count({ where: { needsReview: true } })).toBe(1);
  });

  it("Reinigungsart ändern: protokolliert, bleibt beim erneuten Lauf bestehen", async () => {
    await overrideCleaningType(TODAY, "105", "DEPARTURE", userId);
    await mergeDay(TODAY, userId);
    const row = await prisma.dayRoomPlan.findFirstOrThrow({ where: { date: TODAY, room: { number: "105" } } });
    expect(row).toMatchObject({ cleaningType: "DEPARTURE", typeOverridden: true, derivedType: "SAME_DAY_TURN" });
    expect(await prisma.auditLog.count({ where: { action: "CLEANING_TYPE_CHANGED" } })).toBe(1);
  });

  it("Datenschutz: keine Karten-, Preis-, Saldo- oder Conf-Nr. in Stay/Trace/Plan/Arrival/Log", async () => {
    const dump = JSON.stringify([
      await prisma.stay.findMany(), await prisma.trace.findMany(), await prisma.dayRoomPlan.findMany(),
      await prisma.arrival.findMany(), await prisma.auditLog.findMany(), await prisma.importRow.findMany(), await prisma.importIssue.findMany(),
    ]);
    for (const s of [TEST_CARD, "299.00", "598.00", "RACK", "Banquet", "1920"]) expect(dump, s).not.toContain(s);
  });
});
