import type { RoomType } from "@/lib/domain";

export interface RoomCreditInput {
  type: RoomType;
  credits: Record<RoomType, number>;
}

/**
 * Credit eines Zimmers = Wert seiner **Zimmerkategorie** (Plan-1b, Vorgabe Simon Nov. 2026): Standard 1, Deluxe 1,25,
 * Junior Suite 1,5, alle weiteren Suiten 2 (Standard in `ROOM_TYPE_DEFAULT_CREDITS`, Hauswert per Setting `roomTypeCredits`).
 * Die Reinigungsart (Tidy/Linen change/Turn/Deep clean) ändert den Credit nicht mehr — sie zählt in der Planung als
 * Zimmerzahl und als Mischung je Kraft. Eine Definition für Grundriss, Tagesplan, Listen und Zuteilungsvorschlag.
 */
export function computeRoomCredit({ type, credits }: RoomCreditInput): number {
  return credits[type] ?? 1;
}
