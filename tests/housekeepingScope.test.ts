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

describe("roomNumbersForFloor", () => {
  // Floors 1, 2 and 5 were corrected from real floor plans and are no
  // longer uniform 29-room ranges — see src/lib/domain.ts.
  it("gives each floor its real room count (32/36/33/23/18 = 142 real rooms)", () => {
    const counts: Record<number, number> = { 1: 32, 2: 36, 3: 29, 4: 29, 5: 18 };
    for (const floor of [1, 2, 3, 4, 5]) {
      expect(roomNumbersForFloor(floor)).toHaveLength(counts[floor]);
    }
  });

  it("floor 1 starts at 101 and has no 103/106/107/108/113, running on to 137", () => {
    const numbers = roomNumbersForFloor(1);
    expect(numbers[0]).toBe("101");
    expect(numbers.at(-1)).toBe("137");
    for (const missing of ["103", "106", "107", "108", "113"]) {
      expect(numbers).not.toContain(missing);
    }
  });

  it("floor 2 starts at 201, has no 213, and runs on to 237", () => {
    const numbers = roomNumbersForFloor(2);
    expect(numbers[0]).toBe("201");
    expect(numbers).not.toContain("213");
    expect(numbers.at(-1)).toBe("237");
  });

  it("floor 5 has no 501-512 (lobby/terrace, not guest rooms) and runs 514-535", () => {
    const numbers = roomNumbersForFloor(5);
    expect(numbers[0]).toBe("514");
    expect(numbers.at(-1)).toBe("535");
    for (let n = 501; n <= 512; n++) {
      expect(numbers).not.toContain(String(n));
    }
  });

  it("floors 3 & 4 are untouched by the floor-plan correction: still contiguous, ending at their 29th room", () => {
    expect(roomNumbersForFloor(3).at(-1)).toBe("329");
    expect(roomNumbersForFloor(4).at(-1)).toBe("429");
  });
});
