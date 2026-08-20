/**
 * "How many Room Attendants does today need, and what happens when the
 * house asks for more than the team can realistically give?"
 *
 * This sits above planAssignments(), not inside it. planAssignments balances
 * whatever rooms and attendants it is handed — it never drops a room, it
 * flags overbooking instead (see its own tests). That is still the right
 * behaviour for "I picked 3 attendants for a big house, warn me". This
 * module answers a different question, before that: given the *realistic*
 * staffing envelope of this house, is today's workload even something the
 * team can do — and if not, which rooms make today's cut and which are
 * deferred, on purpose, with a reason.
 */
import { TYPICAL_DAILY_ROOMS } from "./routeOrder";

/** How many Room Attendants this house can realistically field on a shift. */
export const ATTENDANT_POOL = { min: 4, max: 10 } as const;

/**
 * The rooms-per-attendant band and pool size, tunable per house (duty
 * manager settings) rather than a hardcoded constant — a property with a
 * heavier suite mix, or a lean weekend crew, may need a different one.
 * Defaults match the house standard (10-12 rooms, up to 10 attendants).
 */
export interface StaffingConfig {
  roomsPerAttendantMin: number;
  roomsPerAttendantMax: number;
  attendantPoolMax: number;
}
export const DEFAULT_STAFFING_CONFIG: StaffingConfig = {
  roomsPerAttendantMin: TYPICAL_DAILY_ROOMS.low,
  roomsPerAttendantMax: TYPICAL_DAILY_ROOMS.high,
  attendantPoolMax: ATTENDANT_POOL.max,
};

export interface StaffingNeed {
  /** Rooms that need an attendant today — live, deduplicated, from the board. */
  roomsToClean: number;
  /** Fewest attendants that could cover it, at the loose end of the band. */
  neededMin: number;
  /** Most attendants it would take, at the tight end of the band. */
  neededMax: number;
  /** True when neededMin still fits inside the available pool. */
  withinPool: boolean;
  /** What the full pool can realistically cover in one shift, balanced. */
  realisticCapacity: number;
  /** Rooms beyond realisticCapacity — there is no honest way to fit them in today. */
  deferCount: number;
}

export function computeStaffingNeed(
  roomsToClean: number,
  config: StaffingConfig = DEFAULT_STAFFING_CONFIG
): StaffingNeed {
  // Sized off the low end of the band, not the max-rooms ceiling. The max is
  // a hard "never more than" limit, not a planning target — filling every
  // attendant right up to it leaves the room-balancer (see planAssignments'
  // maxRoomsPerAttendant) zero slack to shift rooms away from whichever
  // attendant's round lands on the suite floor, so it ends up forced to hand
  // out a full, evenly-sized ceiling to everyone regardless of how much
  // heavier some of those rounds are. Planning to the low end leaves
  // headroom for that rebalancing without ever breaking the ceiling.
  const realisticCapacity = config.attendantPoolMax * config.roomsPerAttendantMin;
  if (roomsToClean <= 0) {
    return { roomsToClean: 0, neededMin: 0, neededMax: 0, withinPool: true, realisticCapacity, deferCount: 0 };
  }
  const neededMin = Math.max(ATTENDANT_POOL.min, Math.ceil(roomsToClean / config.roomsPerAttendantMax));
  const neededMax = Math.max(ATTENDANT_POOL.min, Math.ceil(roomsToClean / config.roomsPerAttendantMin));
  return {
    roomsToClean,
    neededMin,
    neededMax,
    withinPool: neededMin <= config.attendantPoolMax,
    realisticCapacity,
    deferCount: Math.max(0, roomsToClean - realisticCapacity),
  };
}

export interface DeferrableRoom {
  id: string;
  /**
   * A departure clean that is genuinely time-critical today — i.e. this
   * exact room has a new arrival expected into it later today. A departure
   * with nobody booked into it yet has nobody waiting on it; it is no more
   * urgent than an ordinary stayover and should not automatically outrank
   * one when something has to be set aside.
   */
  isUrgentTurnover: boolean;
  priorityScore: number;
}

/**
 * When there is more work than the pool can realistically absorb, decide
 * what stays in today's plan and what is set aside. A same-day turnover
 * (departure with a new arrival booked into it today) is only ever deferred
 * once every other room already has been — the incoming guest is waiting on
 * it. A departure with no same-day arrival carries no such deadline, so it
 * competes on the same footing as a stayover. Inside each group, the most
 * urgent rooms (per the shared priority score) are kept first.
 */
export function splitForCapacity<T extends DeferrableRoom>(
  rooms: T[],
  keep: number
): { kept: T[]; deferred: T[] } {
  if (rooms.length <= keep) return { kept: rooms, deferred: [] };
  const byUrgency = (a: T, b: T) => b.priorityScore - a.priorityScore;
  const turnovers = rooms.filter((r) => r.isUrgentTurnover).sort(byUrgency);
  const rest = rooms.filter((r) => !r.isUrgentTurnover).sort(byUrgency);
  const kept: T[] = [];
  const deferred: T[] = [];
  for (const r of [...turnovers, ...rest]) (kept.length < keep ? kept : deferred).push(r);
  return { kept, deferred };
}
