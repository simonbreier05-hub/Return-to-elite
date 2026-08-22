import { describe, expect, it } from "vitest";
import { ATTENDANT_POOL, computeStaffingNeed, splitForCapacity } from "@/lib/assignment/staffing";
import { TYPICAL_DAILY_ROOMS } from "@/lib/assignment/routeOrder";

describe("computeStaffingNeed", () => {
  it("reports nothing needed for an empty day", () => {
    const s = computeStaffingNeed(0);
    expect(s).toEqual({ roomsToClean: 0, neededMin: 0, neededMax: 0, withinPool: true, realisticCapacity: 100, deferCount: 0 });
  });

  it("stays within the pool for an ordinary day", () => {
    // 71 rooms — the seeded example this feature was built to fix.
    const s = computeStaffingNeed(71);
    expect(s.neededMin).toBe(Math.ceil(71 / TYPICAL_DAILY_ROOMS.high)); // 6
    expect(s.neededMax).toBe(Math.ceil(71 / TYPICAL_DAILY_ROOMS.low)); // 8
    expect(s.withinPool).toBe(true);
    expect(s.deferCount).toBe(0);
  });

  it("never asks for fewer than the minimum pool, even for a very light day", () => {
    const s = computeStaffingNeed(3);
    expect(s.neededMin).toBe(ATTENDANT_POOL.min);
    expect(s.neededMax).toBe(ATTENDANT_POOL.min);
  });

  it("flags out-of-pool demand and says what is realistically achievable", () => {
    // 145 rooms — the whole house dirty at once.
    const s = computeStaffingNeed(145);
    expect(s.withinPool).toBe(false);
    // Sized off the low end (10/attendant), not the 12-room ceiling — see
    // computeStaffingNeed for why: it leaves the balancer slack instead of
    // saturating every round at the hard cap.
    expect(s.realisticCapacity).toBe(ATTENDANT_POOL.max * TYPICAL_DAILY_ROOMS.low); // 100
    expect(s.deferCount).toBe(145 - 100);
  });

  it("sits exactly on the realistic-capacity boundary without tipping into deferral", () => {
    const s = computeStaffingNeed(ATTENDANT_POOL.max * TYPICAL_DAILY_ROOMS.low); // 100
    expect(s.withinPool).toBe(true);
    expect(s.deferCount).toBe(0);
  });
});

describe("splitForCapacity", () => {
  const room = (id: string, isUrgentTurnover: boolean, priorityScore = 0) => ({ id, isUrgentTurnover, priorityScore });

  it("keeps everything when demand already fits", () => {
    const rooms = [room("a", true), room("b", false)];
    expect(splitForCapacity(rooms, 5)).toEqual({ kept: rooms, deferred: [] });
  });

  it("defers non-urgent rooms before touching a same-day turnover", () => {
    const rooms = [
      room("turn1", true),
      room("turn2", true),
      room("stay1", false),
      room("stay2", false),
      room("stay3", false),
    ];
    const { kept, deferred } = splitForCapacity(rooms, 3);
    expect(kept.map((r) => r.id)).toEqual(expect.arrayContaining(["turn1", "turn2"]));
    expect(deferred.every((r) => !r.isUrgentTurnover)).toBe(true);
    expect(kept).toHaveLength(3);
    expect(deferred).toHaveLength(2);
  });

  it("only defers a same-day turnover once every other room already is", () => {
    const rooms = [room("turn1", true), room("turn2", true), room("turn3", true), room("stay1", false)];
    const { kept, deferred } = splitForCapacity(rooms, 2);
    expect(deferred.map((r) => r.id)).toContain("stay1");
    expect(kept).toHaveLength(2);
    expect(kept.every((r) => r.isUrgentTurnover)).toBe(true);
  });

  it("a departure with no same-day arrival ranks with stayovers, not ahead of them", () => {
    // "cold" departure (isUrgentTurnover: false) — nobody is waiting on it,
    // so a higher-priority stayover is kept over it, same as any other room.
    const rooms = [room("cold-departure", false, 10), room("stayover", false, 90)];
    const { kept } = splitForCapacity(rooms, 1);
    expect(kept.map((r) => r.id)).toEqual(["stayover"]);
  });

  it("keeps the most urgent rooms first within each group", () => {
    const rooms = [room("low", false, 10), room("high", false, 90)];
    const { kept } = splitForCapacity(rooms, 1);
    expect(kept.map((r) => r.id)).toEqual(["high"]);
  });

  it("never loses a room — kept + deferred always equals the input", () => {
    const rooms = Array.from({ length: 20 }, (_, i) => room(`r${i}`, i % 3 === 0, i));
    const { kept, deferred } = splitForCapacity(rooms, 7);
    expect(kept.length + deferred.length).toBe(rooms.length);
    expect(new Set([...kept, ...deferred].map((r) => r.id)).size).toBe(rooms.length);
  });
});
