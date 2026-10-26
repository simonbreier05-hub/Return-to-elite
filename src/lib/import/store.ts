import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { UNKNOWN_ROOM_CRITICAL_RATIO } from "./mapping";
import { buildPreview } from "./preview";
import { missingLists } from "./readiness";
import { issue } from "./parseCommon";
import type { ArrivalRow, DepartureRow, ForecastDayRow, InHouseRow, ParseIssue, ParseResult, TraceRow } from "./types";

type AnyRow = ArrivalRow | DepartureRow | TraceRow | ForecastDayRow | InHouseRow;

export { buildPreview };
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Geschäftsdatum der Liste: Arrivals = Anreisetag der Liste, sonst Druckdatum. */
export function businessDateOf(r: ParseResult<AnyRow>): string | null {
  return r.type === "ARRIVALS" ? r.periodFrom ?? r.reportDate : r.reportDate;
}

/** Unbekannte Zimmer: einzelne = Warnung, mehr als 20 % = kritisch (nichts wird übernommen). */
export function roomIssues(rooms: string[], known: Set<string>): ParseIssue[] {
  const uniq = [...new Set(rooms)];
  const unknown = uniq.filter((r) => !known.has(r));
  if (!unknown.length) return [];
  const critical = unknown.length / uniq.length > UNKNOWN_ROOM_CRITICAL_RATIO;
  return [issue(critical ? "CRITICAL" : "WARNING", "UNKNOWN_ROOM",
    `${unknown.length} von ${uniq.length} Zimmern sind im Zimmerstamm unbekannt: ${unknown.sort().join(", ")}.`)];
}

const ROW_KIND = { DEPARTURES: "DEPARTURE", ARRIVALS: "ARRIVAL", TRACES: "TRACE", INHOUSE: "INHOUSE" } as const;

export const isCritical = (issues: ParseIssue[]) => issues.some((i) => i.severity === "CRITICAL");

/** Legt einen Listenstand als Vorschau (PREVIEW) ab. Nichts ist live, bevor applyBatch läuft. */
export async function storeBatch(input: {
  result: ParseResult<AnyRow>; uploadedById: string; fileHash: string; knownRooms: Set<string>; extraIssues?: ParseIssue[];
}) {
  const { result, uploadedById, fileHash, knownRooms } = input;
  const issues = [...result.issues, ...(input.extraIssues ?? [])];
  const businessDate = businessDateOf(result);
  if (!businessDate && !isCritical(issues)) issues.push(issue("CRITICAL", "BUSINESS_DATE_UNKNOWN", "Geschäftsdatum der Liste nicht lesbar."));
  if (result.type !== "FORECAST") issues.push(...roomIssues(result.rows.map((r) => (r as { room: string }).room), knownRooms));

  const same = await prisma.importBatch.findFirst({ where: { type: result.type, fileHash, status: "APPLIED" } });
  if (same) issues.push(issue("INFO", "SAME_FILE", "Diese Datei wurde bereits übernommen (gleicher Inhalt)."));

  const batch = await prisma.importBatch.create({
    data: {
      type: result.type, businessDate: businessDate ?? "0000-00-00", periodFrom: result.periodFrom, periodTo: result.periodTo,
      uploadedById, fileHash, rowCount: result.rows.length, issueCount: issues.length,
      issues: { create: issues.map((i) => ({ severity: i.severity, code: i.code, message: i.message, page: i.page ?? null, line: i.line ?? null, room: i.room ?? null })) },
      rows: result.type === "FORECAST" ? undefined : {
        create: result.rows.map((row) => ({
          kind: ROW_KIND[result.type as Exclude<ImportType, "FORECAST">],
          room: (row as { room: string }).room, payload: JSON.stringify(row),
        })),
      },
    },
  });
  // Forecast-Zeilen liegen erst nach "Übernehmen" in ForecastDay; bis dahin als JSON am Batch (ImportRow kind FORECAST).
  if (result.type === "FORECAST") {
    await prisma.importRow.createMany({ data: result.rows.map((row) => ({ batchId: batch.id, kind: "FORECAST", payload: JSON.stringify(row) })) });
  }
  return { batch, issues, critical: isCritical(issues) };
}

/** Großzügiger als Prismas 5 s: ein langer Forecast über eine langsame Verbindung darf nicht abbrechen. */
const APPLY_TIMEOUT_MS = 20_000;

/** Übernehmen: ersetzt den vorherigen Stand (gleicher Typ + Tag). Kritische Befunde blockieren. */
export async function applyBatch(batchId: string, userId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { issues: true } });
  if (!batch) throw new Error("Import nicht gefunden.");
  if (batch.status !== "PREVIEW") throw new Error("Import ist nicht mehr in der Vorschau.");
  if (batch.issues.some((i) => i.severity === "CRITICAL")) throw new Error("Kritische Befunde: nichts wird übernommen.");

  const replaced = await prisma.$transaction(async (tx) => {
    const old = await tx.importBatch.deleteMany({
      where: { type: batch.type, businessDate: batch.businessDate, status: "APPLIED", id: { not: batch.id } },
    });
    if (batch.type === "FORECAST") {
      const rows = (await tx.importRow.findMany({ where: { batchId: batch.id, kind: "FORECAST" } })).map((r) => JSON.parse(r.payload) as ForecastDayRow);
      // Ein deleteMany + createMany statt eines upsert je Tag: wenige Abfragen, die Transaktion bleibt kurz.
      await tx.forecastDay.deleteMany({ where: { date: { in: rows.map((d) => d.date) } } });
      if (rows.length) await tx.forecastDay.createMany({ data: rows.map((d) => ({ ...d, batchId: batch.id })) });
      await tx.importRow.deleteMany({ where: { batchId: batch.id, kind: "FORECAST" } }); // Zählwerte liegen jetzt in ForecastDay
    }
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", appliedAt: new Date() } });
    return old.count;
  }, { timeout: APPLY_TIMEOUT_MS, maxWait: APPLY_TIMEOUT_MS });
  // Protokoll ohne Gastnamen: nur Typ, Tag, Anzahl.
  await audit({ action: "IMPORT_APPLIED", userId, meta: { batchId, type: batch.type, businessDate: batch.businessDate, rows: batch.rowCount } });
  if (replaced) await audit({ action: "IMPORT_REPLACED", userId, meta: { batchId, type: batch.type, businessDate: batch.businessDate, replaced } });
}

export async function rejectBatch(batchId: string, userId: string) {
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "REJECTED" } });
  await audit({ action: "IMPORT_REJECTED", userId, meta: { batchId } });
}

/** Server-Gate: welche der fünf Listen für den Betriebstag `date` fehlen (nur übernommene Stände dieses Tages zählen). */
export async function missingAppliedLists(date: string): Promise<ImportType[]> {
  return missingLists(await dataStatus(date));
}

/** "Stand der Daten" je Liste für den Betriebstag `date` (Planungshub, Import-Seite). Stände anderer Tage zählen nicht. */
export async function dataStatus(date: string): Promise<Record<ImportType, { businessDate: string; appliedAt: Date; rows: number } | null>> {
  const out = {} as Awaited<ReturnType<typeof dataStatus>>;
  for (const type of IMPORT_TYPES) {
    const b = await prisma.importBatch.findFirst({ where: { type, status: "APPLIED", businessDate: date }, orderBy: { appliedAt: "desc" } });
    out[type] = b ? { businessDate: b.businessDate, appliedAt: b.appliedAt!, rows: b.rowCount } : null;
  }
  return out;
}
