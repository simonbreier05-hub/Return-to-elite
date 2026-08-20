import { z } from "zod";

/**
 * Central domain vocabulary. Because the DB stores plain strings (to stay
 * portable between SQLite and Postgres), every value is validated against
 * these Zod enums at the API boundary.
 */

export const ROLES = [
  "room_attendant",
  "supervisor",
  "front_office",
  "concierge",
  "engineering",
  "duty_manager",
] as const;
export type Role = (typeof ROLES)[number];
export const RoleSchema = z.enum(ROLES);

export const ROOM_STATUSES = [
  "DIRTY",
  "IN_PROGRESS",
  "CLEAN", // cleaned by attendant, waiting for supervisor inspection ("to-inspect")
  "INSPECTED", // released / sellable — ONLY supervisor & duty_manager may set this
  "PICKUP", // supervisor rejected CLEAN back to the attendant (rework)
  "BLOCKED", // DND / guest in room / double locked / refused
  "DEFECT_REPORTED", // defect blocks cleaning completion, work order open
  "OUT_OF_ORDER", // OOO with end time — room removed from inventory
  "OUT_OF_SERVICE", // OOS — sellable but not serviced
  "GREEN_OPT_OUT", // guest opted out of cleaning today (green program)
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export const RoomStatusSchema = z.enum(ROOM_STATUSES);

export const BLOCK_REASONS = ["DND", "GUEST_IN_ROOM", "DOUBLE_LOCKED", "REFUSED"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
export const BlockReasonSchema = z.enum(BLOCK_REASONS);

/** Short forms that fit inside a board tile without wrapping. */
export const BLOCK_REASON_SHORT: Record<BlockReason, string> = {
  DND: "DND",
  GUEST_IN_ROOM: "Guest in",
  DOUBLE_LOCKED: "Locked",
  REFUSED: "Refused",
};

/** Categories of a five-star city hotel, smallest to largest. */
export const ROOM_TYPES = [
  "CLASSIC",
  "SUPERIOR",
  "DELUXE",
  "JUNIOR_SUITE",
  "SUITE",
  "PENTHOUSE",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  CLASSIC: "Classic",
  SUPERIOR: "Superior",
  DELUXE: "Deluxe",
  JUNIOR_SUITE: "Junior Suite",
  SUITE: "Suite",
  PENTHOUSE: "Penthouse",
};

/** The property: five guest floors, 29 rooms each = 145 keys. */
export const HOTEL = {
  floors: [1, 2, 3, 4, 5],
  roomsPerFloor: 29,
  /** Rooms 01–15 form section A, 16–29 section B. */
  sectionSplit: 15,
} as const;

/**
 * Room numbers for a floor, low to high. Every floor carries
 * `HOTEL.roomsPerFloor` rooms, numbered `{floor}01`…, with one exception:
 * floor 5 skips "513" (the common hotel superstition skip, same idea as a
 * lift with no 13th-floor button) so the top floor still runs up to room
 * "530" instead of stopping at "529" — matching how the house is actually
 * numbered, door to door.
 */
export function roomNumbersForFloor(floor: number): string[] {
  const numbers: string[] = [];
  for (let i = 1; numbers.length < HOTEL.roomsPerFloor; i++) {
    if (floor === 5 && i === 13) continue;
    numbers.push(`${floor}${String(i).padStart(2, "0")}`);
  }
  return numbers;
}

export const DEFECT_CATEGORIES = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "FURNITURE",
  "IT_TV",
  "MINIBAR",
  "OTHER",
] as const;
export const DefectCategorySchema = z.enum(DEFECT_CATEGORIES);

export const WORK_ORDER_STATUSES = ["OPEN", "ACK", "IN_PROGRESS", "RESOLVED"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const WorkOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);

/** Board colors (also documented in the README + used by the supervisor grid). */
export const STATUS_COLORS: Record<RoomStatus, string> = {
  DIRTY: "red",
  IN_PROGRESS: "blue",
  CLEAN: "yellow",
  INSPECTED: "green",
  PICKUP: "orange",
  BLOCKED: "purple",
  DEFECT_REPORTED: "amber",
  OUT_OF_ORDER: "gray",
  OUT_OF_SERVICE: "gray",
  GREEN_OPT_OUT: "teal",
};

export const STATUS_LABELS: Record<RoomStatus, string> = {
  DIRTY: "Dirty",
  IN_PROGRESS: "In Progress",
  CLEAN: "Clean · To Inspect",
  INSPECTED: "Inspected · Released",
  PICKUP: "Pickup / Rework",
  BLOCKED: "Blocked",
  DEFECT_REPORTED: "Defect Reported",
  OUT_OF_ORDER: "Out of Order",
  OUT_OF_SERVICE: "Out of Service",
  GREEN_OPT_OUT: "Green Opt-Out",
};

/** Default escalation thresholds — overridable via the Setting table. */
export const DEFAULT_SETTINGS = {
  blockedRecheckMinutes: 20, // re-check a DND/BLOCKED room after N minutes
  welfareCheckMinutes: 120, // DND older than N minutes => welfare-check reminder
  etaWarningMinutes: 45, // arrival ETA within N minutes & room not INSPECTED => alert
  releaseQueueBacklogThreshold: 5, // CLEAN rooms waiting for inspection => supervisor alert
  // Morning-planning staffing guideline (see src/lib/assignment/staffing.ts).
  // 10-12 rooms/attendant is a house standard, not a law of nature — a
  // property with a heavier mix of suites, or a lean skeleton crew on a
  // Sunday, may need a different band. roomsPerAttendantMax is a hard
  // ceiling (planAssignments never exceeds it); roomsPerAttendantMin sizes
  // how much work the plan realistically takes on before offering to defer.
  roomsPerAttendantMin: 10,
  roomsPerAttendantMax: 12,
  attendantPoolMax: 10, // realistic upper end of the Room Attendant roster
} as const;
export type SettingsShape = { -readonly [K in keyof typeof DEFAULT_SETTINGS]: number };
