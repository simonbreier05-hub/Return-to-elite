import { describe, expect, it } from "vitest";
import { isHousekeepingRelevant } from "../src/lib/rooms/isHousekeepingRelevant";
import { roomNumbersForFloor } from "../src/lib/domain";

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

describe("roomNumbersForFloor — real Hotel de Rome layout", () => {
  // The property is not a uniform 29-rooms-per-floor grid: room counts are
  // read directly off the floor-plan binder and differ floor to floor (see
  // src/lib/floorplan/hotelDeRome.ts).
  it("gives each floor its real, differing room count", () => {
    expect(roomNumbersForFloor(1)).toHaveLength(32);
    expect(roomNumbersForFloor(2)).toHaveLength(36);
    expect(roomNumbersForFloor(3)).toHaveLength(33);
    expect(roomNumbersForFloor(4)).toHaveLength(23);
    expect(roomNumbersForFloor(5)).toHaveLength(15);
  });

  it("floor 1 starts at 101", () => {
    expect(roomNumbersForFloor(1)[0]).toBe("101");
  });

  it("skips numbers that don't exist as separate rooms on the plan", () => {
    // e.g. floor 1 has no 103/106/107/108/113 — those numbers were never
    // seeded, so demo/test data must not reference them either.
    expect(roomNumbersForFloor(1)).not.toContain("108");
  });

  it("floors end where the plan actually ends, not at a formulaic 29th room", () => {
    expect(roomNumbersForFloor(2).at(-1)).toBe("237");
    expect(roomNumbersForFloor(3).at(-1)).toBe("338");
    expect(roomNumbersForFloor(4).at(-1)).toBe("437");
    expect(roomNumbersForFloor(5).at(-1)).toBe("535");
  });
});
