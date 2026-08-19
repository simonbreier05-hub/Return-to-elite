/**
 * Housekeeping cleans a current guest's room and a departing guest's room —
 * not every key in the building. A vacant room nobody is staying in and
 * nobody is checking out of today has nothing to clean; it should never
 * enter the priority feed, the assignment planner, or an attendant's route.
 *
 * This is the single gate every entry point into the cleaning *pipeline*
 * must apply consistently. It intentionally does NOT gate the supervisor's
 * Live Board — a supervisor still needs to see the whole house, vacant
 * rooms included (an OOO/OOS room, a vacant room awaiting a same-day
 * arrival that hasn't been logged as a formal "arrival" yet, etc.).
 */
export interface OccupancyLike {
  occupancy: string; // "OCCUPIED" | "VACANT"
  isCheckoutToday: boolean;
}

export function isHousekeepingRelevant(room: OccupancyLike): boolean {
  return room.occupancy === "OCCUPIED" || room.isCheckoutToday;
}
