import type { RoomStatus } from "@/lib/domain";

/**
 * Status zurückspulen: das Zimmermädchen nimmt den eigenen letzten Statusschritt an einem eigenen Zimmer zurück
 * (z. B. versehentlich „Fertig“ getippt) — genau eine Stufe, nur innerhalb von `Setting statusRewindMinutes` (0 = aus).
 * Reine Regel, ohne DB. Ein zweites Zurückspulen gibt es nicht: der letzte Logbuch-Eintrag ist dann STATUS_REWIND.
 */

/** Nur diese Schritte lassen sich zurücknehmen: Start (→ IN_PROGRESS) und Fertig (→ CLEAN). */
const REWINDABLE_TO: RoomStatus[] = ["IN_PROGRESS", "CLEAN"];
/** Ziele, die ohne Zusatzangaben wiederherstellbar sind (BLOCKED bräuchte einen Grund, INSPECTED nur Supervisor). */
const RESTORABLE_FROM: RoomStatus[] = ["DIRTY", "PICKUP", "IN_PROGRESS"];

export interface LastStatusEntry {
  action: string;
  userId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  at: Date;
}

export function rewindOption(input: {
  role: string;
  userId: string;
  room: { status: string; assignedToId: string | null; assignedOn: string | null };
  today: string;
  last: LastStatusEntry | null;
  now: Date;
  limitMinutes: number;
}): { to: RoomStatus; until: string } | null {
  const { role, userId, room, last, now, limitMinutes } = input;
  if (role !== "room_attendant" || limitMinutes <= 0 || !last) return null;
  if (room.assignedToId !== userId || room.assignedOn !== input.today) return null;
  if (last.action !== "STATUS_CHANGE" || last.userId !== userId || last.toStatus !== room.status) return null;
  if (!REWINDABLE_TO.includes(room.status as RoomStatus) || !RESTORABLE_FROM.includes(last.fromStatus as RoomStatus)) return null;
  const until = new Date(last.at.getTime() + limitMinutes * 60_000);
  if (now > until) return null;
  return { to: last.fromStatus as RoomStatus, until: until.toISOString() };
}
