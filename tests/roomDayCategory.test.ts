import { describe, expect, it } from "vitest";
import { roomDayCategory } from "../src/lib/rooms/roomDayCategory";

describe("roomDayCategory", () => {
  it("is DND whenever blockReason is DND, regardless of anything else", () => {
    expect(
      roomDayCategory({ occupancy: "OCCUPIED", isCheckoutToday: true, blockReason: "DND", hasExpectedArrival: true })
    ).toBe("DND");
  });

  it("is SAME_DAY_TURN for a checkout with a same-day arrival", () => {
    expect(
      roomDayCategory({ occupancy: "OCCUPIED", isCheckoutToday: true, blockReason: null, hasExpectedArrival: true })
    ).toBe("SAME_DAY_TURN");
  });

  it("is DEPARTURE for a checkout with no same-day arrival", () => {
    expect(
      roomDayCategory({ occupancy: "OCCUPIED", isCheckoutToday: true, blockReason: null, hasExpectedArrival: false })
    ).toBe("DEPARTURE");
  });

  it("is ARRIVAL for a vacant room with an expected guest", () => {
    expect(
      roomDayCategory({ occupancy: "VACANT", isCheckoutToday: false, blockReason: null, hasExpectedArrival: true })
    ).toBe("ARRIVAL");
  });

  it("is STAYOVER for an occupied room with no checkout and no new arrival", () => {
    expect(
      roomDayCategory({ occupancy: "OCCUPIED", isCheckoutToday: false, blockReason: null, hasExpectedArrival: false })
    ).toBe("STAYOVER");
  });

  it("is NONE for a vacant room with nothing scheduled", () => {
    expect(
      roomDayCategory({ occupancy: "VACANT", isCheckoutToday: false, blockReason: null, hasExpectedArrival: false })
    ).toBe("NONE");
  });

  it("an occupied room checking out still counts as ARRIVAL-eligible only via same-day-turn, not plain arrival", () => {
    // Occupied + checkout + no new arrival must not be misread as a fresh arrival.
    expect(
      roomDayCategory({ occupancy: "OCCUPIED", isCheckoutToday: true, hasExpectedArrival: false, blockReason: undefined })
    ).toBe("DEPARTURE");
  });
});
