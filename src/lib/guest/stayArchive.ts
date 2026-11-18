import { prisma } from "@/lib/db";

/**
 * F7 (H13, entschieden 16.11.2026): Beim Check-out (und beim Zimmerwechsel aus F3) wird der Verlauf des Aufenthalts
 * archiviert — offene Gastwünsche werden geschlossen (CANCELLED), alle Wünsche und Notizen des Zimmers bekommen
 * `archivedAt`. Archiviertes sehen nur Supervisor/Duty Manager (`GET /api/rooms/[id]/notes?archived=1`), die Listen und
 * der Gastbereich starten für den nächsten Gast leer. Gelöscht wird nach 30 Tagen in der Nachtlöschung
 * (`purgeArchivedStayHistory`, aufgerufen von `runGuestDataRetention`).
 *
 * Annahme: Alle noch nicht archivierten Notizen des Zimmers gehören zum Aufenthalt (technische Dinge laufen über Mängel).
 * Nachrichten (`kind: MESSAGE`) an Aufgaben bleiben unberührt — sie gehören zur Arbeit, nicht zum Gast.
 */
/** `before`: nur bis zu diesem Zeitpunkt Angelegtes (Turn: Notizen/Wünsche des anreisenden Gastes von heute bleiben). */
export async function archiveStayHistory(roomId: string, opts: { stayId?: string | null; now?: Date; before?: Date } = {}): Promise<{ requests: number; notes: number }> {
  const now = opts.now ?? new Date();
  const created = opts.before ? { createdAt: { lt: opts.before } } : {};
  const closed = await prisma.guestRequest.updateMany({
    where: { roomId, archivedAt: null, status: { in: ["RECEIVED", "IN_PROGRESS"] }, ...created },
    data: { status: "CANCELLED", archivedAt: now, ...(opts.stayId ? { stayId: opts.stayId } : {}) },
  });
  const rest = await prisma.guestRequest.updateMany({ where: { roomId, archivedAt: null, ...created }, data: { archivedAt: now, ...(opts.stayId ? { stayId: opts.stayId } : {}) } });
  const notes = await prisma.roomNote.updateMany({ where: { roomId, archivedAt: null, kind: { not: "MESSAGE" }, ...created }, data: { archivedAt: now } });
  return { requests: closed.count + rest.count, notes: notes.count };
}

/** Check-out zurückgenommen (gleicher Tag): was seit `since` archiviert wurde, ist wieder aktiv. Geschlossene Wünsche bleiben geschlossen. */
export async function unarchiveStayHistory(roomId: string, since: Date): Promise<void> {
  await prisma.guestRequest.updateMany({ where: { roomId, archivedAt: { gte: since } }, data: { archivedAt: null } });
  await prisma.roomNote.updateMany({ where: { roomId, archivedAt: { gte: since } }, data: { archivedAt: null } });
}

/** Nachtlöschung: archivierter Verlauf älter als `days` Tage wird gelöscht. */
export async function purgeArchivedStayHistory(now = new Date(), days = 30): Promise<{ requests: number; notes: number }> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const requests = await prisma.guestRequest.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  const notes = await prisma.roomNote.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  return { requests: requests.count, notes: notes.count };
}

/** F7 (H13, Aufgabe 2): offene Reinigungswünsche von früheren Tagen schließen (gelten nur am Tag ihrer Erfassung). Nachtlauf. */
export async function closeStaleCleanRequests(now = new Date()): Promise<number> {
  const { berlinDate, berlinToUtc } = await import("@/lib/dayplan/time");
  const todayStart = berlinToUtc(berlinDate(now), "00:00");
  const r = await prisma.guestRequest.updateMany({ where: { kind: "CLEAN_REQUEST", status: { in: ["RECEIVED", "IN_PROGRESS"] }, createdAt: { lt: todayStart } }, data: { status: "CANCELLED" } });
  return r.count;
}
