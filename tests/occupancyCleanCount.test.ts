import { describe, expect, it } from "vitest";
import { computeOccupancyCleanCounts } from "@/lib/rooms/occupancyCleanCount";

describe("computeOccupancyCleanCounts", () => {
  it("counts occupied rooms and, among those, the ones already cleaned", () => {
    const result = computeOccupancyCleanCounts([
      { occupancy: "OCCUPIED", status: "DIRTY" },
      { occupancy: "OCCUPIED", status: "CLEAN" },
      { occupancy: "OCCUPIED", status: "INSPECTED" },
      { occupancy: "VACANT", status: "INSPECTED" },
    ]);
    expect(result).toEqual({ occupied: 3, cleaned: 2, total: 4 });
  });

  it("never counts a vacant room's status toward cleaned", () => {
    const result = computeOccupancyCleanCounts([{ occupancy: "VACANT", status: "CLEAN" }]);
    expect(result.occupied).toBe(0);
    expect(result.cleaned).toBe(0);
  });

  it("returns zeros for an empty board", () => {
    expect(computeOccupancyCleanCounts([])).toEqual({ occupied: 0, cleaned: 0, total: 0 });
  });
});
