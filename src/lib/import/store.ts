import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { UNKNOWN_ROOM_CRITICAL_RATIO } from "./mapping";
import { buildPreview } from "./preview";
import { berlinToday } from "./businessDay";
import { listBlockers, type ListStatus } from "./readiness";
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
  // Betriebstag ist die App-Uhr; das Dateidatum ist nur ein Abgleich. Fehlt es, wird mit dem Betriebstag gearbeitet (Hinweis, kein Fehler).
  let businessDate = businessDateOf(result);
  if (!businessDate) {
    businessDate = berlinToday();
    issues.push(issue("INFO", "NO_PRINT_DATE", `Kein Druckdatum in der Liste gefunden — sie wird für den Betriebstag ${businessDate} verwendet.`));
  }
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

/** Übernehmen: ersetzt den vorherigen Stand (gleicher Typ + Tag). Kritische Befunde blockieren. */
export async function applyBatch(batchId: string, userId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { issues: true } });
  if (!batch) throw new Error("Import nicht gefunden.");
  if (batch.status !== "PREVIEW") throw new Error("Import ist nicht mehr in der Vorschau.");
  if (batch.issues.some((i) => i.severity === "CRITICAL")) throw new Error("Kritische Befunde: nichts wird übernommen.");

  await prisma.$transaction(async (tx) => {
    await tx.importBatch.deleteMany({
      where: { type: batch.type, businessDate: batch.businessDate, status: "APPLIED", id: { not: batch.id } },
    });
    if (batch.type === "FORECAST") {
      const rows = await tx.importRow.findMany({ where: { batchId: batch.id, kind: "FORECAST" } });
      for (const r of rows) {
        const d = JSON.parse(r.payload) as ForecastDayRow;
        await tx.forecastDay.upsert({
          where: { date: d.date },
          create: { ...d, batchId: batch.id }, update: { ...d, batchId: batch.id },
        });
      }
      await tx.importRow.deleteMany({ where: { batchId: batch.id, kind: "FORECAST" } }); // Zählwerte liegen jetzt in ForecastDay
    }
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", appliedAt: new Date() } });
  });
  // Protokoll ohne Gastnamen: nur Typ, Tag, Anzahl.
  await audit({ action: "IMPORT_APPLIED", userId, meta: { batchId, type: batch.type, businessDate: batch.businessDate, rows: batch.rowCount } });
}

export async function rejectBatch(batchId: string, userId: string) {
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "REJECTED" } });
  await audit({ action: "IMPORT_REJECTED", userId, meta: { batchId } });
}

/** Server-Gate: fehlende und unbestätigt veraltete Listen (nur übernommene Stände zählen, Betriebstag = Berlin heute). */
export async function listBlockersNow(now = new Date()) {
  return listBlockers(await dataStatus(), berlinToday(now));
}

/** Veraltete Liste trotzdem verwenden: nur der aktuelle übernommene Stand des Typs, mit Protokoll (ohne Gastdaten). */
export async function acceptStaleList(type: ImportType, userId: string) {
  const b = await prisma.importBatch.findFirst({ where: { type, status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
  if (!b) throw new Error("Diese Liste ist nicht übernommen.");
  await prisma.importBatch.update({ where: { id: b.id }, data: { staleAcceptedAt: new Date(), staleAcceptedById: userId } });
  await audit({ action: "IMPORT_STALE_ACCEPTED", userId, meta: { batchId: b.id, type, businessDate: b.businessDate, today: berlinToday() } });
  return b.businessDate;
}

/** "Stand der Daten" je Liste für das Planungshub. */
export async function dataStatus(): Promise<Record<ImportType, { businessDate: string; appliedAt: Date; rows: number; staleAccepted: boolean } | null>> {
  const out = {} as Awaited<ReturnType<typeof dataStatus>>;
  for (const type of IMPORT_TYPES) {
    const b = await prisma.importBatch.findFirst({ where: { type, status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
    out[type] = b ? { businessDate: b.businessDate, appliedAt: b.appliedAt!, rows: b.rowCount, staleAccepted: !!b.staleAcceptedAt } : null;
  }
  return out;
}
