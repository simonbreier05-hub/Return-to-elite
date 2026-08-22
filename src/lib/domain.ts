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

/**
 * The property: five guest floors. Floors 1–4 below carry the house's real,
 * confirmed room numbers (source: the "Elite Housekeeping" Airtable room
 * table / the house's own floor plans — see room-seed-data.json, imported
 * by the seed script). Floor 5's floor plan has not been confirmed yet.
 */
export const HOTEL = {
  floors: [1, 2, 3, 4, 5],
  /**
   * Floors with no confirmed room list yet. `roomNumbersForFloor` returns
   * an empty array for these rather than inventing numbers — an empty,
   * clearly-flagged floor is honest; a guessed one silently becomes wrong
   * operational data the moment a supervisor trusts it. The UI reads this
   * to show an explicit "not yet loaded" notice instead of just going
   * quiet. Drop a floor from this list once its real room data lands.
   */
  pendingFloors: [5] as readonly number[],
  /** The house's real key count, floors 1–5 (room-seed-data.json's own
   * `totalRoomsExpected`) — what the UI's "N of 145" notice counts up to
   * once floor 5's plan is confirmed and seeded. Not a guess: it's what
   * the source data itself says the finished house should add up to. */
  expectedTotalRooms: 145,
} as const;

/**
 * Floors 1–3 share one irregular numbering pattern (confirmed floor plans,
 * not a guess): each skips {02, 03}, {05, 06} and 13 (the common hotel
 * superstition skip, same idea as a lift with no 13th-floor button), then
 * runs straight through to 38 — e.g. floor 1 is 101, 104, 107–112, 114–138.
 */
const FLOOR_1_TO_3_SUFFIXES = [
  1, 4, 7, 8, 9, 10, 11, 12,
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
] as const;

/**
 * Floor 4's real numbering, taken directly off the house's own floor plan —
 * a different shape again, not the floors 1–3 pattern. The guest rooms sit
 * around two courtyards and the historic Bebelplatz-facing block rather
 * than one running corridor, so 403–411, 413, 426, 427, 429 and 430 simply
 * don't exist as guest rooms on this floor (housekeeping closets, the fire
 * escape, lifts and the service lift take some of those numbers instead).
 * Kept as an explicit list rather than a formula, because a formula can't
 * express "these specific numbers, no others."
 */
const FLOOR_4_ROOMS = [
  "401", "402",
  "412", "414", "415", "416", "417", "418", "419",
  "420", "421", "422", "423", "424", "425", "428",
  "431", "432", "433", "434", "435", "436", "437",
] as const;

/**
 * Floor 4's two wings, also read off the floor plan: 401/402 and 431–437
 * cluster together near the lobby and lifts on the Bebelplatz side; 412
 * through 428 run down the Innenhof corridor towards Französische Straße.
 * A room attendant working this floor should stay in one wing, not
 * zig-zag between them — see roomNumbersForFloor's callers.
 */
export const FLOOR_4_SECTION: Record<(typeof FLOOR_4_ROOMS)[number], "4A" | "4B"> = {
  "401": "4A", "402": "4A",
  "431": "4A", "432": "4A", "433": "4A", "434": "4A", "435": "4A", "436": "4A", "437": "4A",
  "412": "4B", "414": "4B", "415": "4B", "416": "4B", "417": "4B", "418": "4B", "419": "4B",
  "420": "4B", "421": "4B", "422": "4B", "423": "4B", "424": "4B", "425": "4B", "428": "4B",
};

/**
 * Room numbers for a floor, in a sensible walking/display order — every
 * number here is real, confirmed data, floor by floor (see the comments
 * above each list). Floor 5 deliberately returns an empty array: see
 * HOTEL.pendingFloors.
 */
export function roomNumbersForFloor(floor: number): string[] {
  if (floor === 1 || floor === 2 || floor === 3) {
    return FLOOR_1_TO_3_SUFFIXES.map((n) => `${floor}${String(n).padStart(2, "0")}`);
  }
  if (floor === 4) return [...FLOOR_4_ROOMS];
  return [];
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
