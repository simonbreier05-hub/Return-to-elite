/**
 * Which of the five day-status categories a room falls into for the floor
 * plan's colour overlay: Arrival / Departure / Stayover / Same-Day-Turn /
 * DND. Built from fields the board already carries (occupancy,
 * isCheckoutToday, blockReason, whether an EXPECTED arrival exists) — no new
 * schema needed. DND always wins (a guest cannot be disturbed regardless of
 * arrival/departure), then same-day-turn (a departure with a same-day
 * arrival is the busiest, most time-critical case), then plain departure or
 * arrival, then stayover.
 */
export type RoomDayCategory = "DND" | "SAME_DAY_TURN" | "DEPARTURE" | "ARRIVAL" | "STAYOVER" | "NONE";

export interface RoomDayCategoryInput {
  occupancy: string; // "OCCUPIED" | "VACANT"
  isCheckoutToday: boolean;
  blockReason?: string | null;
  hasExpectedArrival: boolean;
}

export function roomDayCategory(room: RoomDayCategoryInput): RoomDayCategory {
  if (room.blockReason === "DND") return "DND";
  if (room.isCheckoutToday && room.hasExpectedArrival) return "SAME_DAY_TURN";
  if (room.isCheckoutToday) return "DEPARTURE";
  if (room.hasExpectedArrival && room.occupancy !== "OCCUPIED") return "ARRIVAL";
  if (room.occupancy === "OCCUPIED") return "STAYOVER";
  return "NONE";
}
