import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { getGuestSystemUserId } from "@/lib/guestServer";
import { runGuestDataRetention } from "@/lib/guestDataRetention";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { legacyTraceKey, TRACE_KEY_PREFIX, traceKey } from "@/lib/dayplan/traceKey";

/**
 * Nachtlöschung der Gastdaten (M3). StayClean ist nur Arbeitsansicht, Opera
 * bleibt führend: jeden Abend (Setting guestPurgeHour, Standard 22:00 Berlin)
 * werden Namen, Trace-Texte und freie Gästetexte gelöscht bzw. auf leer
 * gesetzt (kein Soft-Delete). Planung, Zuteilungen, Zähler und Wäsche-Daten
 * bleiben; am nächsten Morgen stellt der Import die Namen wieder her.
 *
 * Datenkarte (siehe docs/datenschutz-loeschkonzept.md):
 *   Stay.guestName, Arrival.guestName            → ""   (Zeile bleibt; Stay nach guestStayDeleteDays ganz weg)
 *   Excursion.guestName / .note                  → NULL
 *   Trace.text                                   → ""   (Zeile + HMAC-Schlüssel bleiben: "erledigt"/"Aufgabe angelegt" gehen nicht verloren)
 *   ImportRow (Roh-Zwischenablage)               → gelöscht
 *   RoomNote vom Gäste-Systemkonto               → gelöscht
 *   AuditLog.meta: Freitext-Schlüssel            → entfernt
 *   Gäste-Fotos, geschlossene Gästeanfragen      → bestehende Regel (runGuestDataRetention), im selben Lauf
 */

/** Meta-Schlüssel im Protokoll, die Freitext oder Namen enthalten können. */
export const AUDIT_PII_KEYS = ["guestName", "name", "text", "note", "body", "message"] as const;

/** Letzter geplanter Löschzeitpunkt (Berlin, `hour`:00), der nicht in der Zukunft liegt. */
export function latestScheduledPurge(now: Date, hour: number): Date {
  const hhmm = `${String(hour).padStart(2, "0")}:00`;
  const today = berlinToUtc(berlinDate(now), hhmm);
  if (today <= now) return today;
  return berlinToUtc(berlinDate(new Date(now.getTime() - 86_400_000)), hhmm);
}

/** Fällig, wenn seit dem letzten geplanten Zeitpunkt kein erfolgreicher Lauf stattfand (Nachholen nach Ausfall). */
export function isPurgeDue(now: Date, lastOkFinishedAt: Date | null, hour: number): boolean {
  return !lastOkFinishedAt || lastOkFinishedAt < latestScheduledPurge(now, hour);
}

export type PurgeCounts = Record<string, number>;

async function scrubAuditMeta(): Promise<number> {
  let changed = 0;
  const rows = await prisma.auditLog.findMany({
    where: { meta: { not: null }, OR: AUDIT_PII_KEYS.map((k) => ({ meta: { contains: `"${k}"` } })) },
    select: { id: true, meta: true },
  });
  for (const r of rows) {
    try {
      const meta = JSON.parse(r.meta!) as Record<string, unknown>;
      let hit = false;
      for (const k of AUDIT_PII_KEYS) if (k in meta) { delete meta[k]; hit = true; }
      if (hit) { await prisma.auditLog.update({ where: { id: r.id }, data: { meta: JSON.stringify(meta) } }); changed++; }
    } catch { /* kein JSON — unverändert lassen */ }
  }
  return changed;
}

async function purgeTraceTexts(): Promise<number> {
  const rows = await prisma.trace.findMany({
    where: { OR: [{ text: { not: "" } }, { NOT: { dedupeKey: { startsWith: TRACE_KEY_PREFIX } } }] },
    include: { room: { select: { number: true } } },
  });
  for (const t of rows) {
    // Klartext-Schlüssel (vor M3) in HMAC umwandeln, bevor der Text verschwindet.
    const key = t.dedupeKey.startsWith(TRACE_KEY_PREFIX) ? t.dedupeKey : traceKey(t.room.number, t.code, t.date, t.text || legacyText(t.dedupeKey, t));
    await prisma.trace.update({ where: { id: t.id }, data: { text: "", dedupeKey: key } });
  }
  return rows.length;
}
const legacyText = (key: string, t: { code: string; date: string }) => key.split(`|${t.code}|${t.date}|`)[1] ?? "";

/** Kernlauf: löscht alle Gastdaten laut Datenkarte. Idempotent — ein zweiter Lauf findet nichts mehr. */
export async function purgeGuestDataNow(now = new Date()): Promise<PurgeCounts> {
  const settings = await getSettings();
  const guestSystemUserId = await getGuestSystemUserId();
  const counts: PurgeCounts = {};

  counts.stayNames = (await prisma.stay.updateMany({ where: { guestName: { not: "" } }, data: { guestName: "" } })).count;
  counts.arrivalNames = (await prisma.arrival.updateMany({ where: { guestName: { not: "" } }, data: { guestName: "" } })).count;
  counts.excursions = (await prisma.excursion.updateMany({
    where: { OR: [{ guestName: { not: null } }, { note: { not: null } }] }, data: { guestName: null, note: null },
  })).count;
  counts.traceTexts = await purgeTraceTexts();
  counts.importRows = (await prisma.importRow.deleteMany({})).count;
  counts.guestNotes = (await prisma.roomNote.deleteMany({ where: { authorId: guestSystemUserId } })).count;
  counts.auditEntries = await scrubAuditMeta();

  const cutoff = new Date(now.getTime() - settings.guestStayDeleteDays * 86_400_000);
  counts.staysDeleted = (await prisma.stay.deleteMany({ where: { checkOut: { lt: cutoff } } })).count;

  // Bestehende Regel (Gäste-Fotos, geschlossene Anfragen) im selben Lauf.
  const r = await runGuestDataRetention(now);
  counts.retentionRun = Object.values(r as Record<string, number>).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
  return counts;
}

/** Lauf mit Nachweis (PurgeRun). Fehler enthalten nur den Fehlertyp, nie Inhalte. */
export async function runGuestDataPurge(trigger: "SCHEDULE" | "MANUAL", userId?: string | null, now = new Date()) {
  const running = await prisma.purgeRun.findFirst({ where: { status: "RUNNING", startedAt: { gt: new Date(now.getTime() - 10 * 60_000) } } });
  if (running) return { skipped: true as const, reason: "RUNNING" };
  const run = await prisma.purgeRun.create({ data: { trigger, status: "RUNNING", userId: userId ?? null } });
  try {
    const counts = await purgeGuestDataNow(now);
    await prisma.purgeRun.update({ where: { id: run.id }, data: { status: "OK", finishedAt: new Date(), counts: JSON.stringify(counts) } });
    await audit({ action: "GUEST_DATA_PURGED", userId: userId ?? null, meta: { trigger, counts } });
    return { skipped: false as const, runId: run.id, counts };
  } catch (e) {
    console.error("[guest-data-purge] failed:", e instanceof Error ? e.name : "error");
    await prisma.purgeRun.update({ where: { id: run.id }, data: { status: "ERROR", finishedAt: new Date(), error: e instanceof Error ? e.name : "Error" } });
    throw e;
  }
}

export async function lastSuccessfulPurge() {
  return prisma.purgeRun.findFirst({ where: { status: "OK", trigger: { in: ["SCHEDULE", "MANUAL"] } }, orderBy: { finishedAt: "desc" } });
}

/** Vom Ticker: läuft nur, wenn seit dem letzten geplanten Zeitpunkt noch nichts lief (auch nach Server-Ausfall). */
export async function runDuePurge(now = new Date()) {
  const settings = await getSettings();
  const last = await lastSuccessfulPurge();
  if (!isPurgeDue(now, last?.finishedAt ?? null, settings.guestPurgeHour)) return { ran: false as const };
  return { ran: true as const, ...(await runGuestDataPurge("SCHEDULE", null, now)) };
}

/** Einzellöschung (Auskunfts-/Löschwunsch): alle personenbezogenen Daten eines Aufenthalts sofort entfernen. */
export async function purgeStay(stayId: string, userId: string) {
  const stay = await prisma.stay.findUnique({ where: { id: stayId } });
  if (!stay) throw new Error("Aufenthalt nicht gefunden.");
  const run = await prisma.purgeRun.create({ data: { trigger: "STAY", status: "RUNNING", userId } });
  const from = new Date(stay.checkIn.getTime() - 7 * 86_400_000);
  const isoFrom = from.toISOString().slice(0, 10), isoTo = stay.checkOut.toISOString().slice(0, 10);
  const counts: PurgeCounts = {};
  counts.stayNames = (await prisma.stay.updateMany({ where: { id: stayId }, data: { guestName: "" } })).count;
  counts.arrivalNames = (await prisma.arrival.updateMany({
    where: { roomId: stay.roomId, createdAt: { gte: from, lte: new Date(stay.checkOut.getTime() + 86_400_000) } }, data: { guestName: "" },
  })).count;
  counts.excursions = (await prisma.excursion.updateMany({
    where: { roomId: stay.roomId, startsAt: { gte: from, lte: new Date(stay.checkOut.getTime() + 86_400_000) } }, data: { guestName: null, note: null },
  })).count;
  const traces = await prisma.trace.findMany({ where: { roomId: stay.roomId, date: { gte: isoFrom, lte: isoTo }, text: { not: "" } }, include: { room: { select: { number: true } } } });
  for (const t of traces) await prisma.trace.update({ where: { id: t.id }, data: { text: "", dedupeKey: traceKey(t.room.number, t.code, t.date, t.text) } });
  counts.traceTexts = traces.length;
  const roomNumber = (await prisma.room.findUnique({ where: { id: stay.roomId }, select: { number: true } }))?.number;
  counts.importRows = roomNumber ? (await prisma.importRow.deleteMany({ where: { room: roomNumber } })).count : 0; // nie ohne Zimmerfilter löschen
  await prisma.purgeRun.update({ where: { id: run.id }, data: { status: "OK", finishedAt: new Date(), counts: JSON.stringify(counts) } });
  await audit({ action: "GUEST_STAY_PURGED", userId, roomId: stay.roomId, meta: { stayId, counts } });
  return counts;
}
