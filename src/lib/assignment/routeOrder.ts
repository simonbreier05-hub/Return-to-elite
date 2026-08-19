/**
 * The attendant "Laufplan" — a calculated running/walking order for one
 * attendant's rooms, on top of everything else the app already knows
 * (priority score, which already folds in urgency, arrivals, blocked age,
 * VIP, and proximity — see computePriority). This module only supplies the
 * *fallback* order used before anyone has dragged a room, and the shared
 * capacity guidance for "how many rooms is a lot".
 *
 * The order actually shown to an attendant is, in priority:
 *   1. a persisted `routeOrder` (set when a plan is applied, or by a drag)
 *   2. this fallback, computed fresh every time there is no persisted order
 */
export interface RouteRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  priorityScore: number;
}

/**
 * Highest priority first; ties broken by floor → section → room number so
 * the fallback still reads as a sane physical walk, not a priority-only
 * jumble that sends someone back and forth between floors.
 */
export function defaultRouteOrder<T extends RouteRoom>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (a.floor !== b.floor) return a.floor - b.floor;
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return a.number.localeCompare(b.number);
  });
}

/**
 * Orientation figure from the house: depending on how busy the day is, an
 * attendant completes on average 10-12 rooms, very rarely more. This is a
 * distinct signal from the assignment planner's minutes-based `overbooked`
 * flag — a short list of very large suites can blow the minutes budget
 * while still being, say, 6 rooms (light by room count); a long list of
 * quick stayover touch-ups can hit 14 rooms while comfortably inside the
 * minutes budget. Both are worth knowing, separately.
 */
export const TYPICAL_DAILY_ROOMS = { low: 10, high: 12 } as const;

export type RouteLoad = "light" | "typical" | "heavy";

export function routeLoadLabel(roomCount: number): RouteLoad {
  if (roomCount <= TYPICAL_DAILY_ROOMS.low) return "light";
  if (roomCount <= TYPICAL_DAILY_ROOMS.high) return "typical";
  return "heavy";
}

/** Groups an already-ordered list into contiguous same-floor runs, in order. */
export function chunkByFloor<T extends { floor: number }>(ordered: T[]): { floor: number; items: T[] }[] {
  const chunks: { floor: number; items: T[] }[] = [];
  for (const item of ordered) {
    const last = chunks[chunks.length - 1];
    if (last && last.floor === item.floor) last.items.push(item);
    else chunks.push({ floor: item.floor, items: [item] });
  }
  return chunks;
}
