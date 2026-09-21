import { FLOORS } from "./domain";

/**
 * User.assignedFloors is stored as a comma-separated string (scalar list
 * types aren't portable to SQLite — same reason as Room.interconnectingGroup)
 * — these are the only two places that format is read or written.
 */
export function parseAssignedFloors(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => (FLOORS as readonly number[]).includes(n));
}

export function serializeAssignedFloors(floors: number[]): string {
  return [...new Set(floors)]
    .filter((n) => (FLOORS as readonly number[]).includes(n))
    .sort((a, b) => a - b)
    .join(",");
}
