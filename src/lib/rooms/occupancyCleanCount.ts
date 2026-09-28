/**
 * "N rooms occupied, M of those already cleaned" — the one figure the Duty
 * Manager dashboard and the Planungshub both show, kept as a single
 * function so the two screens can never disagree about what counts as
 * "cleaned" (CLEAN or INSPECTED — attendant finished, whether or not a
 * supervisor has released it yet).
 */
export interface OccupancyCleanCountInput {
  occupancy: string; // "OCCUPIED" | "VACANT"
  status: string; // RoomStatus
}

export interface OccupancyCleanCounts {
  occupied: number;
  cleaned: number;
  total: number;
}

const CLEANED_STATUSES = new Set(["CLEAN", "INSPECTED"]);

export function computeOccupancyCleanCounts(rooms: OccupancyCleanCountInput[]): OccupancyCleanCounts {
  let occupied = 0;
  let cleaned = 0;
  for (const r of rooms) {
    if (r.occupancy !== "OCCUPIED") continue;
    occupied++;
    if (CLEANED_STATUSES.has(r.status)) cleaned++;
  }
  return { occupied, cleaned, total: rooms.length };
}
