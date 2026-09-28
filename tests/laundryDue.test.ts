import { describe, expect, it } from "vitest";
import { isLaundryDue } from "@/lib/rooms/laundryDue";

const day = (n: number) => new Date(2026, 0, n);

describe("isLaundryDue", () => {
  it("is never due for a non-stayover category", () => {
    expect(isLaundryDue({ category: "DEPARTURE", lastLinenChangeAt: null, now: day(10), linenCycleDays: 3 })).toBe(
      false
    );
    expect(isLaundryDue({ category: "ARRIVAL", lastLinenChangeAt: null, now: day(10), linenCycleDays: 3 })).toBe(
      false
    );
  });

  it("is due for a stayover that was never recorded", () => {
    expect(isLaundryDue({ category: "STAYOVER", lastLinenChangeAt: null, now: day(10), linenCycleDays: 3 })).toBe(
      true
    );
  });

  it("is not due before the cycle elapses", () => {
    expect(
      isLaundryDue({ category: "STAYOVER", lastLinenChangeAt: day(8), now: day(10), linenCycleDays: 3 })
    ).toBe(false);
  });

  it("is due once the cycle has elapsed", () => {
    expect(
      isLaundryDue({ category: "STAYOVER", lastLinenChangeAt: day(7), now: day(10), linenCycleDays: 3 })
    ).toBe(true);
  });
});
