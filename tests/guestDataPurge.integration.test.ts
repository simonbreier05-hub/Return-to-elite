import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Nachtlöschung gegen eine echte (Wegwerf-)SQLite-DB: Nach dem Lauf darf in KEINER Tabelle mehr ein
 * Gastname oder Trace-Text stehen (Scan über alle Tabellen inkl. AuditLog), die Planung läuft ohne
 * Namen weiter, der nächste Import stellt Namen und Traces wieder her, ein zweiter Lauf ändert nichts.
 */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-purge-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { applyDayPlanToBoard, mergeDay } from "@/lib/dayplan/merge";
import { purgeGuestDataNow, purgeStay, runDuePurge, runGuestDataPurge } from "@/lib/guestDataPurge";
import * as build from "@/lib/import/sample/build";
import { loadList, parseList } from "@/lib/import/readFile";
import { todayScenario } from "@/lib/import/sample/scenario";
import { applyBatch, sha256, storeBatch } from "@/lib/import/store";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";

const TODAY = "2026-10-06";
const ROOMS = Array.from({ length: 20 }, (_, i) => String(101 + i));
const sc = todayScenario(TODAY, ROOMS, 145);
let userId = "", attendantId = "";

// Namen und Trace-Texte der Beispiele — dürfen nach der Löschung nirgends mehr stehen
const NAMES = ["Testfrau", "Beispiel", "Probe", "Muster", "Fiktiv", "Mustermann", "Erfunden", "Beispielfrau", "Testmann", "Probst", "Demofrau", "Fiktivo", "Demo", "Müller-Lüdenscheidt"];
const TEXTS = ["Twin beds please", "Extra bed for child", "Zustellbett bitte", "Give extra chair", "Late check-out requested", "Twin back to king bed", "Baby cot already delivered", "Nachtruhe wegen Baby"];

async function importAll() {
  const files: [string, Uint8Array, Parameters<typeof parseList>[0]][] = [
    ["res_detail.pdf", await build.buildArrivalsPdf(sc), "ARRIVALS"],
    ["departure_all.pdf", await build.buildDeparturesPdf(sc), "DEPARTURES"],
    ["history_forecast.pdf", await build.buildForecastPdf(sc), "FORECAST"],
    ["traces_all.pdf", await build.buildTracesPdf(sc), "TRACES"],
  ];
  const known = new Set((await prisma.room.findMany()).map((r) => r.number));
  for (const [name, bytes, type] of files) {
    const result = parseList(type, await loadList(name, bytes), { today: TODAY });
    const { batch, critical } = await storeBatch({ result, uploadedById: userId, fileHash: sha256(bytes), knownRooms: known });
    expect(critical, type).toBe(false);
    await applyBatch(batch.id, userId);
  }
}

/** Alle Tabellen, alle Spalten als Text — damit auch künftige Tabellen nicht durchrutschen. */
async function dumpAllTables(): Promise<string> {
  const tables = (await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%'`)).map((t) => t.name);
  let out = "";
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${t}"`);
    out += JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  }
  return out;
}
const leaks = (dump: string) => [...NAMES, ...TEXTS].filter((s) => dump.includes(s));

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Nachtlöschung der Gastdaten (Wegwerf-DB)", () => {
  it("bereitet Tag, Zuteilung und zusätzliche Gastdaten vor", async () => {
    userId = (await prisma.user.create({ data: { email: "sup@x.test", name: "Sup", passwordHash: "x", role: "supervisor" } })).id;
    attendantId = (await prisma.user.create({ data: { email: "att@x.test", name: "Att", passwordHash: "x", role: "room_attendant" } })).id;
    const guestSys = await prisma.user.create({ data: { email: GUEST_SYSTEM_EMAIL, name: "Gast", passwordHash: "x", role: "room_attendant" } });
    for (const n of ROOMS) await prisma.room.create({ data: { number: n, floor: 1, section: "1A", type: "STANDARD" } });
    await importAll();
    await mergeDay(TODAY, userId);
    await applyDayPlanToBoard(TODAY, userId);
    await prisma.room.updateMany({ where: { number: { in: ["101", "106", "110"] } }, data: { assignedToId: attendantId } });
    const r105 = await prisma.room.findUniqueOrThrow({ where: { number: "105" } });
    await prisma.excursion.create({ data: { roomId: r105.id, guestName: "Müller-Lüdenscheidt", note: "Nachtruhe wegen Baby", startsAt: new Date(), endsAt: new Date(), createdById: userId } });
    await prisma.roomNote.create({ data: { roomId: r105.id, authorId: guestSys.id, body: "Nachtruhe wegen Baby, Fam. Müller-Lüdenscheidt" } });
    await prisma.arrival.create({ data: { roomId: r105.id, guestName: "Demo, Jonas", status: "EXPECTED", createdById: userId } });
    await prisma.auditLog.create({ data: { action: "STATUS_CHANGE", roomId: r105.id, meta: JSON.stringify({ note: "Herr Testmann wünscht Zustellbett bitte", role: "supervisor" }) } });
    expect(leaks(await dumpAllTables()).length).toBeGreaterThan(5); // Vorbedingung: es gibt etwas zu löschen
  }, 60_000);

  it("Einzellöschung: nur der gewählte Aufenthalt, nichts anderes", async () => {
    const stay = await prisma.stay.findFirstOrThrow({ where: { room: { number: "102" } }, orderBy: { checkIn: "asc" } });
    const other = await prisma.stay.findFirstOrThrow({ where: { room: { number: "103" } } });
    expect(stay.guestName).not.toBe("");
    await purgeStay(stay.id, userId);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: stay.id } })).guestName).toBe("");
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: other.id } })).guestName).not.toBe("");
    expect(await prisma.purgeRun.count({ where: { trigger: "STAY", status: "OK" } })).toBe(1);
  });

  it("zeitgesteuerter Lauf: nicht fällig direkt nach dem Lauf, nach Ausfall wird nachgeholt", async () => {
    expect((await runDuePurge(new Date("2026-10-06T21:00:00Z"))).ran).toBe(true); // nie gelaufen → fällig
    expect((await runDuePurge(new Date())).ran).toBe(false); // gerade gelaufen
    const keep = await dumpAllTables();
    expect(leaks(keep)).toEqual([]); // dieser Lauf hat alles gelöscht
  });

  it("keine Tabelle enthält danach noch Gastnamen oder Trace-Texte (auch AuditLog)", async () => {
    const dump = await dumpAllTables();
    expect(leaks(dump)).toEqual([]);
    const audit = JSON.stringify(await prisma.auditLog.findMany());
    expect(audit).not.toContain("Zustellbett");
  });

  it("Planung läuft ohne Namen weiter: Plan, Zuteilungen, Zähler, Aufgaben bleiben", async () => {
    expect(await prisma.dayRoomPlan.count({ where: { date: TODAY } })).toBe(20);
    expect(await prisma.room.count({ where: { assignedToId: attendantId } })).toBe(3);
    expect((await prisma.room.findUniqueOrThrow({ where: { number: "106" } })).lastLinenChangeAt).not.toBeNull();
    expect(await prisma.roomTask.count()).toBe(4);
    const traces = await prisma.trace.findMany();
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.every((t) => t.text === "" && t.dedupeKey.startsWith("h1:"))).toBe(true);
    expect(await prisma.importBatch.count({ where: { status: "APPLIED" } })).toBe(4); // Batches (nur Zähler) bleiben
    expect(await prisma.importRow.count()).toBe(0);
    await expect(mergeDay(TODAY, userId)).rejects.toThrow(/gelöscht/); // nie mit leeren Listen weiterrechnen
    const r = await applyDayPlanToBoard(TODAY, userId);
    expect(r.rooms).toBe(20);
  });

  it("zweiter Lauf ändert nichts (idempotent)", async () => {
    const counts = await purgeGuestDataNow();
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it("nächster Import stellt Namen und Traces wieder her; Zuteilungen, Aufgaben, Zähler unverändert", async () => {
    const before = [await prisma.stay.count(), await prisma.trace.count(), await prisma.roomTask.count(), await prisma.dayRoomPlan.count()];
    await importAll();
    await mergeDay(TODAY, userId);
    expect([await prisma.stay.count(), await prisma.trace.count(), await prisma.roomTask.count(), await prisma.dayRoomPlan.count()]).toEqual(before);
    expect(await prisma.stay.count({ where: { guestName: "" } })).toBeLessThan(before[0]); // Namen sind zurück
    expect((await prisma.stay.findFirstOrThrow({ where: { room: { number: "106" } } })).guestName).toMatch(/\S/);
    expect(await prisma.trace.count({ where: { text: "" } })).toBe(0);
    expect(await prisma.room.count({ where: { assignedToId: attendantId } })).toBe(3);
  });

  it("Aufenthalte ohne Namen werden nach der Frist ganz gelöscht", async () => {
    const old = await prisma.stay.findFirstOrThrow({ where: { room: { number: "101" } } });
    await prisma.stay.update({ where: { id: old.id }, data: { checkOut: new Date(Date.now() - 40 * 86_400_000) } });
    const before = await prisma.stay.count();
    const r = await runGuestDataPurge("MANUAL", userId);
    expect(r.skipped).toBe(false);
    expect(await prisma.stay.count()).toBe(before - 1);
    expect(leaks(await dumpAllTables())).toEqual([]);
  });

  it("Nachweis: PurgeRun enthält nur Zähler, kein Fehler", async () => {
    const runs = await prisma.purgeRun.findMany();
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs.every((r) => r.status === "OK" && !r.error)).toBe(true);
    expect(JSON.stringify(runs)).not.toMatch(/Testfrau|Müller/);
  });
});
