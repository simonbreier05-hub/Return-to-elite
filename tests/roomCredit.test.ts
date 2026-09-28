import { describe, expect, it } from "vitest";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import { ROOM_TYPE_DEFAULT_CREDITS } from "@/lib/domain";

const credits = ROOM_TYPE_DEFAULT_CREDITS;

describe("computeRoomCredit", () => {
  it("charges the full room-type credit for a departure", () => {
    expect(
      computeRoomCredit({ type: "CLASSIC", category: "DEPARTURE", laundryDue: false, credits, tidyCredit: 0.5 })
    ).toBe(1);
    expect(
      computeRoomCredit({ type: "JUNIOR_SUITE", category: "DEPARTURE", laundryDue: false, credits, tidyCredit: 0.5 })
    ).toBe(1.5);
  });

  it("charges the tidy credit for a stayover not due for linen", () => {
    expect(
      computeRoomCredit({ type: "JUNIOR_SUITE", category: "STAYOVER", laundryDue: false, credits, tidyCredit: 0.5 })
    ).toBe(0.5);
  });

  it("charges the full room-type credit for a stayover due for linen", () => {
    expect(
      computeRoomCredit({ type: "JUNIOR_SUITE", category: "STAYOVER", laundryDue: true, credits, tidyCredit: 0.5 })
    ).toBe(1.5);
  });

  it("always charges a full clean for a same-day turn, regardless of laundryDue", () => {
    expect(
      computeRoomCredit({ type: "CLASSIC", category: "SAME_DAY_TURN", laundryDue: false, credits, tidyCredit: 0.5 })
    ).toBe(1);
  });
});
