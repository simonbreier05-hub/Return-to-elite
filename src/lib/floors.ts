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

/**
 * What GET /api/rooms should restrict a request to, given who's asking.
 * Only a supervisor is ever scoped, and only once they actually have floors
 * assigned — an unconfigured supervisor fails open (sees the whole house)
 * rather than being silently locked out. `allFloors` is the explicit escape
 * hatch for a caller that needs the whole house regardless of role (the
 * floor-plan reference page).
 */
export function resolveFloorScope({
  role,
  assignedFloorsRaw,
  allFloors,
}: {
  role: string;
  assignedFloorsRaw: string | null | undefined;
  allFloors: boolean;
}): number[] | null {
  if (role !== "supervisor" || allFloors) return null;
  const floors = parseAssignedFloors(assignedFloorsRaw);
  return floors.length > 0 ? floors : null;
}
