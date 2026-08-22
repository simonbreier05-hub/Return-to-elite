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
  it("gives floor 3 (photographed, the full pattern) exactly 33 rooms", () => {
    expect(roomNumbersForFloor(3)).toHaveLength(33);
  });

  it("floors 1, 2 and 5 are trimmed a few rooms short of floor 3's full pattern", () => {
    expect(roomNumbersForFloor(1)).toHaveLength(30);
    expect(roomNumbersForFloor(2)).toHaveLength(30);
    expect(roomNumbersForFloor(5)).toHaveLength(29);
  });

  it("floor 1 starts at 101", () => {
    expect(roomNumbersForFloor(1)[0]).toBe("101");
  });

  it("floors 1, 2, 3 and 5 share one pattern (skip 02/03, 05/06, 13), each cut at its own top", () => {
    const top: Record<number, string> = { 1: "135", 2: "235", 3: "338", 5: "534" };
    for (const floor of [1, 2, 3, 5]) {
      const numbers = roomNumbersForFloor(floor);
      expect(numbers.at(-1)).toBe(top[floor]);
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

  it("floors 1, 2 and 5 are flagged unconfirmed — a real room list, just not floor-plan-verified", () => {
    for (const floor of [1, 2, 5]) {
      expect(HOTEL.unconfirmedFloors).toContain(floor);
      expect(roomNumbersForFloor(floor).length).toBeGreaterThan(0);
    }
    for (const floor of [3, 4]) expect(HOTEL.unconfirmedFloors).not.toContain(floor);
  });

  it("returns a fresh array each call — callers can't mutate the shared list", () => {
    const a = roomNumbersForFloor(4);
    a.push("999");
    expect(roomNumbersForFloor(4)).not.toContain("999");
  });

  it("adds up to the house's full 145 keys across floors 1-5", () => {
    const total = [1, 2, 3, 4, 5].reduce((sum, f) => sum + roomNumbersForFloor(f).length, 0);
    expect(total).toBe(145);
  });
});
