import { describe, expect, it } from "vitest";
import { parseAssignedFloors, serializeAssignedFloors } from "@/lib/floors";

describe("parseAssignedFloors / serializeAssignedFloors", () => {
  it("parses a comma-separated list into sorted floor numbers", () => {
    expect(parseAssignedFloors("3,1")).toEqual([3, 1]);
  });

  it("treats null, undefined and empty string as no floors assigned", () => {
    expect(parseAssignedFloors(null)).toEqual([]);
    expect(parseAssignedFloors(undefined)).toEqual([]);
    expect(parseAssignedFloors("")).toEqual([]);
  });

  it("drops values outside the hotel's real floors (1-5)", () => {
    expect(parseAssignedFloors("1,6,0,-2,3")).toEqual([1, 3]);
  });

  it("serializes floors as a deduplicated, ascending comma-separated string", () => {
    expect(serializeAssignedFloors([3, 1, 3, 5])).toBe("1,3,5");
  });

  it("serializes an empty selection to an empty string", () => {
    expect(serializeAssignedFloors([])).toBe("");
  });

  it("drops out-of-range floors on serialize, the same as on parse", () => {
    expect(serializeAssignedFloors([1, 6, 0])).toBe("1");
  });

  it("round-trips through parse/serialize", () => {
    const floors = [5, 2, 4];
    expect(parseAssignedFloors(serializeAssignedFloors(floors))).toEqual([2, 4, 5]);
  });
});
