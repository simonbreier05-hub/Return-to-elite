import { now as clockNow } from "@/lib/clock";
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
  const now = opts.now ?? clockNow();
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
export async function purgeArchivedStayHistory(now = clockNow(), days = 30): Promise<{ requests: number; notes: number }> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const requests = await prisma.guestRequest.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  const notes = await prisma.roomNote.deleteMany({ where: { archivedAt: { lt: cutoff } } });
  return { requests: requests.count, notes: notes.count };
}

/** F7 (H13, Aufgabe 2): offene Reinigungswünsche von früheren Tagen schließen (gelten nur am Tag ihrer Erfassung). Nachtlauf. */
export async function closeStaleCleanRequests(now = clockNow()): Promise<number> {
  const { berlinDate, berlinToUtc } = await import("@/lib/dayplan/time");
  const todayStart = berlinToUtc(berlinDate(now), "00:00");
  const r = await prisma.guestRequest.updateMany({ where: { kind: "CLEAN_REQUEST", status: { in: ["RECEIVED", "IN_PROGRESS"] }, createdAt: { lt: todayStart } }, data: { status: "CANCELLED" } });
  return r.count;
}

/**
 * F7-Nachtrag (Abreise nur über Opera): Aufenthalte, deren Abreisetag vor `date` liegt und die noch „im Haus“ stehen
 * (das Front Office hat nicht auf „Check-out“ gedrückt), schließt der Import des Tages `date` ab — wie der Check-out-Knopf:
 * Profilvorschlag (F8, einmal je Aufenthalt), Verlauf archivieren (nur bis zur Anreise eines Folgegastes im selben Zimmer),
 * Status CHECKED_OUT. Ein verlängerter Aufenthalt hat im heutigen Import ein späteres Abreisedatum und bleibt unberührt.
 * Logbuch `GUEST_DEPARTED_IMPORT` (nur Ids, keine Gastdaten). Gibt die Anzahl zurück.
 */
export async function closeDepartedImportStays(date: string, now = clockNow(), opts: { keep?: string[][] } = {}): Promise<number> {
  /** Review (H1): Aufenthalte, die heute noch in den Listen stehen ([Zimmer, Anreise]), bleiben in jedem Fall. */
  const keep = new Set((opts.keep ?? []).map(([room, arr]) => `${room}|${arr}`));
  const { berlinDate, berlinToUtc } = await import("@/lib/dayplan/time");
  const { buildProfileSuggestion } = await import("@/lib/guest/profileSuggestion");
  const stays = await prisma.stay.findMany({
    where: { source: "IMPORT", status: "IN_HOUSE", checkOut: { lt: new Date(`${date}T00:00:00Z`) } },
    select: { id: true, roomId: true, checkOut: true, checkIn: true, room: { select: { number: true } } },
  });
  let closed = 0;
  for (const s of stays) {
    if (keep.has(`${s.room.number}|${s.checkIn.toISOString().slice(0, 10)}`)) continue;
    const depDay = berlinDate(s.checkOut);
    await buildProfileSuggestion(s.id, berlinToUtc(depDay, "23:59")).catch(() => null);
    const next = await prisma.stay.findFirst({ where: { roomId: s.roomId, id: { not: s.id }, status: { not: "CANCELLED" }, checkIn: { gt: new Date(s.checkOut.getTime() - 86_400_000) } }, orderBy: { checkIn: "asc" }, select: { checkIn: true } });
    await archiveStayHistory(s.roomId, { stayId: s.id, now, ...(next ? { before: berlinToUtc(berlinDate(next.checkIn), "00:00") } : {}) });
    await prisma.stay.update({ where: { id: s.id }, data: { status: "CHECKED_OUT" } });
    await prisma.auditLog.create({ data: { action: "GUEST_DEPARTED_IMPORT", roomId: s.roomId, meta: JSON.stringify({ stayId: s.id, date }) } });
    closed++;
  }
  return closed;
}
