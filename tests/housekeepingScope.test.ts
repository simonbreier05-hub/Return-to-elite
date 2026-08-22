import { describe, expect, it } from "vitest";
import { isHousekeepingRelevant } from "../src/lib/rooms/isHousekeepingRelevant";
import { HOTEL, roomNumbersForFloor } from "../src/lib/domain";

describe("isHousekeepingRelevant", () => {
  it("is relevant when a guest is currently in the room", () => {
    expect(isHousekeepingRelevant({ occupancy: "OCCUPIED", isCheckoutToday: false })).toBe(true);
  });

  it("is relevant when a guest checks out today, even if already marked vacant", () => {
    expect(isHousekeepingRelevant({ occupancy: "VACANT", isCheckoutToday: true })).toBe(true);
  });

  it("is NOT relevant for a vacant room with nobody checking out today", () => {
    expect(isHousekeepingRelevant({ occupancy: "VACANT", isCheckoutToday: false })).toBe(false);
  });

  it("is relevant when both occupied and checking out (mid-stay guest leaving today)", () => {
    expect(isHousekeepingRelevant({ occupancy: "OCCUPIED", isCheckoutToday: true })).toBe(true);
  });
});

describe("roomNumbersForFloor", () => {
  it("gives floors 1-3 exactly 33 rooms, their confirmed real count", () => {
    for (const floor of [1, 2, 3]) {
      expect(roomNumbersForFloor(floor)).toHaveLength(33);
    }
  });

  it("floor 1 starts at 101", () => {
    expect(roomNumbersForFloor(1)[0]).toBe("101");
  });

  it("floors 1-3 share one irregular pattern: skip 02/03, 05/06, 13, then run to 38", () => {
    for (const floor of [1, 2, 3]) {
      const numbers = roomNumbersForFloor(floor);
      expect(numbers.at(-1)).toBe(`${floor}38`);
      for (const suffix of ["02", "03", "05", "06", "13"]) {
        expect(numbers).not.toContain(`${floor}${suffix}`);
      }
    }
  });

  it("floor 4 follows the house's real, irregular numbering — not a running corridor", () => {
    const numbers = roomNumbersForFloor(4);
    expect(numbers).toHaveLength(23);
    expect(numbers[0]).toBe("401");
    expect(numbers.at(-1)).toBe("437");
    // Numbers taken by non-guest spaces on this floor plan (housekeeping
    // closets, lifts, the fire escape, the service lift) never appear.
    for (const missing of ["403", "404", "410", "411", "413", "426", "427", "429", "430"]) {
      expect(numbers).not.toContain(missing);
    }
  });

  it("floor 5 is empty — its floor plan is not confirmed yet, so nothing is invented", () => {
    expect(roomNumbersForFloor(5)).toEqual([]);
    expect(HOTEL.pendingFloors).toContain(5);
  });

  it("returns a fresh array each call — callers can't mutate the shared list", () => {
    const a = roomNumbersForFloor(4);
    a.push("999");
    expect(roomNumbersForFloor(4)).not.toContain("999");
  });

  it("adds up to the house's confirmed 122 keys across floors 1-4", () => {
    const total = [1, 2, 3, 4, 5].reduce((sum, f) => sum + roomNumbersForFloor(f).length, 0);
    expect(total).toBe(122);
  });
});
