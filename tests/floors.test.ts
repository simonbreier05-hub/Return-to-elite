import { describe, expect, it } from "vitest";
import { parseAssignedFloors, resolveFloorScope, serializeAssignedFloors } from "@/lib/floors";

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

describe("resolveFloorScope", () => {
  it("scopes a supervisor to their assigned floors", () => {
    expect(resolveFloorScope({ role: "supervisor", assignedFloorsRaw: "1,2", allFloors: false })).toEqual([1, 2]);
  });

  it("fails open (no scope) for a supervisor with no floors assigned yet", () => {
    expect(resolveFloorScope({ role: "supervisor", assignedFloorsRaw: "", allFloors: false })).toBeNull();
    expect(resolveFloorScope({ role: "supervisor", assignedFloorsRaw: null, allFloors: false })).toBeNull();
  });

  it("never scopes duty_manager, even with floors somehow set", () => {
    expect(resolveFloorScope({ role: "duty_manager", assignedFloorsRaw: "1", allFloors: false })).toBeNull();
  });

  it("never scopes any other role", () => {
    expect(resolveFloorScope({ role: "front_office", assignedFloorsRaw: "1", allFloors: false })).toBeNull();
  });

  it("the allFloors escape hatch bypasses scoping even for an assigned supervisor", () => {
    expect(resolveFloorScope({ role: "supervisor", assignedFloorsRaw: "1,2", allFloors: true })).toBeNull();
  });
});
