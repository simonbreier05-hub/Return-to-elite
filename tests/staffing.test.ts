import { describe, expect, it } from "vitest";
import { ATTENDANT_POOL, computeStaffingNeed, splitForCapacity } from "@/lib/assignment/staffing";
import { TYPICAL_DAILY_ROOMS } from "@/lib/assignment/routeOrder";

describe("computeStaffingNeed", () => {
  it("reports nothing needed for an empty day", () => {
    const s = computeStaffingNeed(0);
    expect(s).toEqual({ roomsToClean: 0, neededMin: 0, neededMax: 0, withinPool: true, realisticCapacity: 120, deferCount: 0 });
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
    expect(s.realisticCapacity).toBe(ATTENDANT_POOL.max * TYPICAL_DAILY_ROOMS.high); // 120
    expect(s.deferCount).toBe(145 - 120);
  });

  it("sits exactly on the pool boundary without tipping into deferral", () => {
    const s = computeStaffingNeed(ATTENDANT_POOL.max * TYPICAL_DAILY_ROOMS.high); // 120
    expect(s.withinPool).toBe(true);
    expect(s.deferCount).toBe(0);
  });
});

describe("splitForCapacity", () => {
  const room = (id: string, isDeparture: boolean, priorityScore = 0) => ({ id, isDeparture, priorityScore });

  it("keeps everything when demand already fits", () => {
    const rooms = [room("a", true), room("b", false)];
    expect(splitForCapacity(rooms, 5)).toEqual({ kept: rooms, deferred: [] });
  });

  it("defers stayovers before touching a single departure", () => {
    const rooms = [
      room("dep1", true),
      room("dep2", true),
      room("stay1", false),
      room("stay2", false),
      room("stay3", false),
    ];
    const { kept, deferred } = splitForCapacity(rooms, 3);
    expect(kept.map((r) => r.id)).toEqual(expect.arrayContaining(["dep1", "dep2"]));
    expect(deferred.every((r) => !r.isDeparture)).toBe(true);
    expect(kept).toHaveLength(3);
    expect(deferred).toHaveLength(2);
  });

  it("only defers a departure once every stayover already is deferred", () => {
    const rooms = [room("dep1", true), room("dep2", true), room("dep3", true), room("stay1", false)];
    const { kept, deferred } = splitForCapacity(rooms, 2);
    expect(deferred.map((r) => r.id)).toContain("stay1");
    expect(kept).toHaveLength(2);
    expect(kept.every((r) => r.isDeparture)).toBe(true);
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
