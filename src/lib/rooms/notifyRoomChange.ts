import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { keyed } from "@/lib/i18n/notificationText";

/** Was sich an einem Zimmer geändert hat (Zuteilung/Verschiebung melden `notifyReassignment`/`notifyBulkReassignment`). */
export type RoomChangeKind = "NOTE" | "TRACE" | "DND" | "DND_ENDED" | "GUEST_WISH" | "PRIORITY" | "REWORK" | "DEFECT_FIXED" | "EXCURSION" | "EXCURSION_SOON";

const TEXT: Record<RoomChangeKind, string> = {
  NOTE: "neue Notiz",
  TRACE: "neuer Hinweis (Trace)",
  DND: "Gast: Bitte nicht stören",
  DND_ENDED: "Bitte nicht stören beendet",
  GUEST_WISH: "neuer Gastwunsch",
  PRIORITY: "Priorität geändert",
  REWORK: "Nacharbeit angefordert — bitte Hinweis im Zimmer lesen",
  DEFECT_FIXED: "Mangel behoben",
  EXCURSION: "Gast ist außer Haus (Ausflug eingetragen)",
  EXCURSION_SOON: "Gast kommt bald zurück",
};

/** Eigene Meldungsart (Glocke/Pop-up-Kopf) für die neuen Anlässe aus Paket O1; alles andere bleibt „Zimmer geändert“. */
const TYPE: Partial<Record<RoomChangeKind, string>> = { REWORK: "ROOM_REWORK", DEFECT_FIXED: "DEFECT_FIXED", EXCURSION: "EXCURSION", EXCURSION_SOON: "EXCURSION" };
/** Dringend (Pop-up bleibt bis Antippen, doppelter Ton). */
const URGENT: ReadonlySet<RoomChangeKind> = new Set(["DND", "PRIORITY", "REWORK"]);

/** Meldetext: nur Zimmer, Etage und Art der Änderung — nie Notiz-/Trace-Text, nie Gastdaten. */
export function roomChangeMessage(room: { number: string; floor: number }, kind: RoomChangeKind): string {
  return `Zimmer ${room.number} (Etage ${room.floor}): ${TEXT[kind]}.`;
}

/**
 * Meldet dem Zimmermädchen, dem das Zimmer heute zugeteilt ist, eine Änderung an ihrem Zimmer — live über das bestehende
 * Meldungssystem (`Notification.targetUserId`, `notification:new`). Wer die Änderung selbst ausgelöst hat, wird nicht gemeldet.
 * Eine Meldung darf die eigentliche Aktion nie scheitern lassen: Fehler werden geschluckt.
 *
 * `skipUserId`: diese Person nicht melden (z. B. weil sie schon eine eigene Meldung bekommt). `dedupeKey`: höchstens
 * eine Meldung je Schlüssel (Ticker, „Gast kommt bald zurück“). Liefert die gemeldete Person (oder null).
 */
export async function notifyHousekeeperOfRoomChange(opts: { roomId: string; kind: RoomChangeKind; actorId?: string | null; now?: Date; skipUserId?: string | null; dedupeKey?: string }): Promise<string | null> {
  try {
    const room = await prisma.room.findUnique({ where: { id: opts.roomId }, select: { id: true, number: true, floor: true, assignedToId: true, assignedOn: true } });
    if (!room?.assignedToId || room.assignedOn !== berlinDate(opts.now ?? new Date()) || room.assignedToId === opts.actorId || room.assignedToId === opts.skipUserId) return null;
    if (opts.dedupeKey && (await prisma.notification.findFirst({ where: { dedupeKey: opts.dedupeKey }, select: { id: true } }))) return null;
    const notification = await prisma.notification.create({
      data: {
        type: TYPE[opts.kind] ?? "ROOM_CHANGED", level: URGENT.has(opts.kind) ? "warning" : "info", targetRole: "room_attendant", targetUserId: room.assignedToId, roomId: room.id,
        message: roomChangeMessage(room, opts.kind), ...keyed("notify.roomChange", { n: room.number, floor: room.floor, whatKey: `notify.change${opts.kind}` }),
        ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
      },
    });
    broadcast("notification:new", { notification });
    return room.assignedToId;
  } catch {
    return null;
  }
}
