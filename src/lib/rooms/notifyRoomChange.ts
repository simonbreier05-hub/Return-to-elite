import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";

/** Was sich an einem Zimmer geändert hat (Zuteilung/Verschiebung melden `notifyReassignment`/`notifyBulkReassignment`). */
export type RoomChangeKind = "NOTE" | "TRACE" | "DND" | "DND_ENDED" | "GUEST_WISH" | "PRIORITY";

const TEXT: Record<RoomChangeKind, string> = {
  NOTE: "neue Notiz",
  TRACE: "neuer Hinweis (Trace)",
  DND: "Gast: Bitte nicht stören",
  DND_ENDED: "Bitte nicht stören beendet",
  GUEST_WISH: "neuer Gastwunsch",
  PRIORITY: "Priorität geändert",
};

/** Meldetext: nur Zimmer, Etage und Art der Änderung — nie Notiz-/Trace-Text, nie Gastdaten. */
export function roomChangeMessage(room: { number: string; floor: number }, kind: RoomChangeKind): string {
  return `Zimmer ${room.number} (Etage ${room.floor}): ${TEXT[kind]}.`;
}

/**
 * Meldet dem Zimmermädchen, dem das Zimmer heute zugeteilt ist, eine Änderung an ihrem Zimmer — live über das bestehende
 * Meldungssystem (`Notification.targetUserId`, `notification:new`). Wer die Änderung selbst ausgelöst hat, wird nicht gemeldet.
 * Eine Meldung darf die eigentliche Aktion nie scheitern lassen: Fehler werden geschluckt.
 */
export async function notifyHousekeeperOfRoomChange(opts: { roomId: string; kind: RoomChangeKind; actorId?: string | null; now?: Date }): Promise<boolean> {
  try {
    const room = await prisma.room.findUnique({ where: { id: opts.roomId }, select: { id: true, number: true, floor: true, assignedToId: true, assignedOn: true } });
    if (!room?.assignedToId || room.assignedOn !== berlinDate(opts.now ?? new Date()) || room.assignedToId === opts.actorId) return false;
    const notification = await prisma.notification.create({
      data: { type: "ROOM_CHANGED", level: opts.kind === "DND" || opts.kind === "PRIORITY" ? "warning" : "info", targetRole: "room_attendant", targetUserId: room.assignedToId, roomId: room.id, message: roomChangeMessage(room, opts.kind) },
    });
    broadcast("notification:new", { notification });
    return true;
  } catch {
    return false;
  }
}
