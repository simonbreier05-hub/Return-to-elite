import type { RoomDayCategory } from "./roomDayCategory";

export interface LaundryDueInput {
  category: RoomDayCategory;
  /** Null means never recorded — treated as due. */
  lastLinenChangeAt: Date | null;
  now: Date;
  linenCycleDays: number;
}

/**
 * Whether a room's towels/linen need changing today. Only stayovers cycle
 * on a timer — a departure or same-day-turn clean always includes a full
 * linen change as part of turning the room over, and an arrival room gets
 * one before the guest ever checks in, so neither is "due" in this sense.
 */
export function isLaundryDue({ category, lastLinenChangeAt, now, linenCycleDays }: LaundryDueInput): boolean {
  if (category !== "STAYOVER") return false;
  if (!lastLinenChangeAt) return true;
  const daysSince = (now.getTime() - lastLinenChangeAt.getTime()) / 86_400_000;
  return daysSince >= linenCycleDays;
}
