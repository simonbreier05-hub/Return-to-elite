import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { ImportType } from "@/lib/domain";
import { UNKNOWN_ROOM_CRITICAL_RATIO } from "./mapping";
import { maskName } from "./names";
import { issue } from "./parseCommon";
import type { ArrivalRow, DepartureRow, ForecastDayRow, ParseIssue, ParseResult, TraceRow } from "./types";

type AnyRow = ArrivalRow | DepartureRow | TraceRow | ForecastDayRow;

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

export const isCritical = (issues: ParseIssue[]) => issues.some((i) => i.severity === "CRITICAL");

/** Vorschau für die Oberfläche: Zähler, Zeitraum, erste Zeilen — Namen maskiert. */
export function buildPreview(r: ParseResult<AnyRow>, sampleSize = 5) {
  const mask = (row: AnyRow) => {
    const g = "guest" in row ? row.guest : null;
    const { guest: _g, ...rest } = row as AnyRow & { guest?: unknown };
    void _g;
    return g ? { ...rest, guest: [g.salutation, g.title, maskName(g.lastName)].filter(Boolean).join(" ") } : rest;
  };
  return {
    type: r.type, count: r.rows.length, reportDate: r.reportDate, periodFrom: r.periodFrom, periodTo: r.periodTo,
    pages: { seen: r.pagesSeen, total: r.pagesTotal }, dateFormat: r.dates,
    sample: r.rows.slice(0, sampleSize).map(mask),
    critical: r.issues.filter((i) => i.severity === "CRITICAL").length,
    warnings: r.issues.filter((i) => i.severity === "WARNING").length,
  };
}

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
          kind: result.type === "DEPARTURES" ? "DEPARTURE" : result.type === "ARRIVALS" ? "ARRIVAL" : "TRACE",
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

/** "Stand der Daten" je Liste für das Planungshub. */
export async function dataStatus(): Promise<Record<ImportType, { businessDate: string; appliedAt: Date; rows: number } | null>> {
  const out = {} as Awaited<ReturnType<typeof dataStatus>>;
  for (const type of ["FORECAST", "DEPARTURES", "ARRIVALS", "TRACES"] as const) {
    const b = await prisma.importBatch.findFirst({ where: { type, status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
    out[type] = b ? { businessDate: b.businessDate, appliedAt: b.appliedAt!, rows: b.rowCount } : null;
  }
  return out;
}
