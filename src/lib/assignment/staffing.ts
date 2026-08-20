/**
 * "How many Room Attendants does today need, and what happens when the
 * house asks for more than the team can realistically give?"
 *
 * This sits above planAssignments(), not inside it. planAssignments balances
 * whatever rooms and attendants it is handed — it never drops a room, it
 * flags overbooking instead (see its own tests). That is still the right
 * behaviour for "I picked 3 attendants for a big house, warn me". This
 * module answers a different question, before that: given the *realistic*
 * staffing envelope of this house (4-10 attendants, 10-12 rooms each), is
 * today's workload even something the team can do — and if not, which rooms
 * make today's cut and which are deferred, on purpose, with a reason.
 */
import { TYPICAL_DAILY_ROOMS } from "./routeOrder";

/** How many Room Attendants this house can realistically field on a shift. */
export const ATTENDANT_POOL = { min: 4, max: 10 } as const;

export interface StaffingNeed {
  /** Rooms that need an attendant today — live, deduplicated, from the board. */
  roomsToClean: number;
  /** Fewest attendants that could cover it, at the loose end of the band (12/each). */
  neededMin: number;
  /** Most attendants it would take, at the tight end of the band (10/each). */
  neededMax: number;
  /** True when neededMin still fits inside the available pool (≤ 10). */
  withinPool: boolean;
  /** What the full pool (10 attendants × 12 rooms) can realistically cover in one shift. */
  realisticCapacity: number;
  /** Rooms beyond realisticCapacity — there is no honest way to fit them in today. */
  deferCount: number;
}

export function computeStaffingNeed(roomsToClean: number): StaffingNeed {
  const realisticCapacity = ATTENDANT_POOL.max * TYPICAL_DAILY_ROOMS.high;
  if (roomsToClean <= 0) {
    return { roomsToClean: 0, neededMin: 0, neededMax: 0, withinPool: true, realisticCapacity, deferCount: 0 };
  }
  const neededMin = Math.max(ATTENDANT_POOL.min, Math.ceil(roomsToClean / TYPICAL_DAILY_ROOMS.high));
  const neededMax = Math.max(ATTENDANT_POOL.min, Math.ceil(roomsToClean / TYPICAL_DAILY_ROOMS.low));
  return {
    roomsToClean,
    neededMin,
    neededMax,
    withinPool: neededMin <= ATTENDANT_POOL.max,
    realisticCapacity,
    deferCount: Math.max(0, roomsToClean - realisticCapacity),
  };
}

export interface DeferrableRoom {
  id: string;
  isDeparture: boolean;
  priorityScore: number;
}

/**
 * When there is more work than the pool can realistically absorb, decide
 * what stays in today's plan and what is set aside. Departures are
 * time-critical — the guest checking in behind them is waiting on the room —
 * so a departure is only ever deferred once every stayover already has been.
 * Inside each group, the most urgent rooms (per the shared priority score)
 * are kept first.
 */
export function splitForCapacity<T extends DeferrableRoom>(
  rooms: T[],
  keep: number
): { kept: T[]; deferred: T[] } {
  if (rooms.length <= keep) return { kept: rooms, deferred: [] };
  const byUrgency = (a: T, b: T) => b.priorityScore - a.priorityScore;
  const departures = rooms.filter((r) => r.isDeparture).sort(byUrgency);
  const stayovers = rooms.filter((r) => !r.isDeparture).sort(byUrgency);
  const kept: T[] = [];
  const deferred: T[] = [];
  for (const r of [...departures, ...stayovers]) (kept.length < keep ? kept : deferred).push(r);
  return { kept, deferred };
}
