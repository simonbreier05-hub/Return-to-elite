import type { RoomType } from "@/lib/domain";

export interface RoomCreditInput {
  type: RoomType;
  credits: Record<RoomType, number>;
  /** Credit je Zimmer aus der offiziellen Zimmerliste (`Room.credit`); gesetzt = gilt vor dem Kategorie-Wert. */
  roomCredit?: number | null;
}

/**
 * Credit eines Zimmers = Wert seiner **Zimmerkategorie** (Plan-1b, Vorgabe Simon Nov. 2026): Standard 1, Deluxe 1,25,
 * Junior Suite 1,5, alle weiteren Suiten 2 (Standard in `ROOM_TYPE_DEFAULT_CREDITS`, Hauswert per Setting `roomTypeCredits`).
 * Die Reinigungsart (Tidy/Linen change/Turn/Deep clean) ändert den Credit nicht mehr — sie zählt in der Planung als
 * Zimmerzahl und als Mischung je Kraft. Eine Definition für Grundriss, Tagesplan, Listen und Zuteilungsvorschlag.
 */
export function computeRoomCredit({ type, credits, roomCredit }: RoomCreditInput): number {
  if (typeof roomCredit === "number" && Number.isFinite(roomCredit) && roomCredit > 0) return roomCredit;
  return credits[type] ?? 1;
}

/**
 * Planung L1 (Meeting 13.11.): Zeit eines Zimmers = Credit × Minuten je Credit (Setting `minutesPerCredit`, Standard 40):
 * 1 = 40 min, 1,5 = 60, 1,75 = 70, 2 = 80, 3,5 = 140. Gilt für jede Art gleich — „Bleiber = 0,7 Abreise“ gibt es nicht mehr.
 */
export function creditMinutes(credit: number, minutesPerCredit: number): number {
  return Math.round(credit * minutesPerCredit);
}
