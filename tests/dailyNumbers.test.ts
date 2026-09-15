import { describe, expect, it } from "vitest";
import { assignDailyNumbers } from "@/lib/assignment/dailyNumbers";

describe("assignDailyNumbers", () => {
  it("numbers attendants sequentially from 1, alphabetically by name", () => {
    const result = assignDailyNumbers([
      { id: "u-petra", name: "Petra Novak" },
      { id: "u-aylin", name: "Aylin Kaya" },
      { id: "u-maria", name: "Maria Silva" },
    ]);
    expect(result).toEqual([
      { id: "u-aylin", dailyNumber: 1 },
      { id: "u-maria", dailyNumber: 2 },
      { id: "u-petra", dailyNumber: 3 },
    ]);
  });

  it("returns an empty list for no attendants", () => {
    expect(assignDailyNumbers([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [{ id: "b", name: "Bea" }, { id: "a", name: "Anna" }];
    const copy = [...input];
    assignDailyNumbers(input);
    expect(input).toEqual(copy);
  });
});
