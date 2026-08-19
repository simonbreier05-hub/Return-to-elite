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
  it("gives every floor exactly 29 rooms", () => {
    for (const floor of [1, 2, 3, 4, 5]) {
      expect(roomNumbersForFloor(floor)).toHaveLength(29);
    }
  });

  it("floor 1 starts at 101", () => {
    expect(roomNumbersForFloor(1)[0]).toBe("101");
  });

  it("floor 5 ends at 530, skipping the superstition number 513", () => {
    const numbers = roomNumbersForFloor(5);
    expect(numbers[numbers.length - 1]).toBe("530");
    expect(numbers).not.toContain("513");
    expect(numbers[0]).toBe("501");
  });

  it("floors 2-4 stay contiguous and end at their floor's 29th room", () => {
    expect(roomNumbersForFloor(2).at(-1)).toBe("229");
    expect(roomNumbersForFloor(3).at(-1)).toBe("329");
    expect(roomNumbersForFloor(4).at(-1)).toBe("429");
  });
});
