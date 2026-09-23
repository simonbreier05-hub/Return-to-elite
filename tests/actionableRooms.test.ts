import { describe, expect, it } from "vitest";
import { unassignedActionableRooms } from "@/lib/assignment/actionableRooms";

describe("unassignedActionableRooms", () => {
  it("counts today's actionable rooms minus deferred ones as the denominator", () => {
    const result = unassignedActionableRooms({
      actionableRoomIds: ["r1", "r2", "r3", "r4"],
      deferredRoomIds: ["r4"],
      assignedToIdByRoomId: {},
    });
    expect(result.totalActionable).toBe(3);
  });

  it("lists only rooms with nobody assigned yet", () => {
    const result = unassignedActionableRooms({
      actionableRoomIds: ["r1", "r2", "r3"],
      deferredRoomIds: [],
      assignedToIdByRoomId: { r1: "attendant-a", r2: null },
    });
    expect(result.unassignedRoomIds.sort()).toEqual(["r2", "r3"]);
  });

  it("never counts a deferred room as unassigned, even without an attendant", () => {
    const result = unassignedActionableRooms({
      actionableRoomIds: ["r1", "r2"],
      deferredRoomIds: ["r2"],
      assignedToIdByRoomId: {},
    });
    expect(result.unassignedRoomIds).toEqual(["r1"]);
    expect(result.totalActionable).toBe(1);
  });

  it("returns empty when every actionable room already has an attendant", () => {
    const result = unassignedActionableRooms({
      actionableRoomIds: ["r1", "r2"],
      deferredRoomIds: [],
      assignedToIdByRoomId: { r1: "a", r2: "b" },
    });
    expect(result.unassignedRoomIds).toEqual([]);
    expect(result.totalActionable).toBe(2);
  });
});
