import type { RoomType } from "@/lib/domain";
import type { RoomDayCategory } from "./roomDayCategory";

export interface RoomCreditInput {
  type: RoomType;
  category: RoomDayCategory;
  /** From isLaundryDue — only meaningful when category is STAYOVER. */
  laundryDue: boolean;
  credits: Record<RoomType, number>;
  tidyCredit: number;
}

/**
 * A stayover that isn't due for a linen change is a lighter "tidy" clean
 * (make the bed, refresh the bathroom, no towels/sheets) rather than a full
 * room-type clean — see Schritt 4. Every other category (arrival,
 * departure, same-day-turn, DND-blocked-but-still-counted) is always a full
 * clean at the room's own credit value.
 */
export function computeRoomCredit({ type, category, laundryDue, credits, tidyCredit }: RoomCreditInput): number {
  if (category === "STAYOVER" && !laundryDue) return tidyCredit;
  return credits[type] ?? 1;
}
