import { describe, expect, it } from "vitest";
import { chunkByFloor, defaultRouteOrder, routeLoadLabel, TYPICAL_DAILY_ROOMS } from "../src/lib/assignment/routeOrder";

const room = (id: string, floor: number, section: string, number: string, priorityScore: number) => ({
  id, floor, section, number, priorityScore,
});

describe("defaultRouteOrder", () => {
  it("orders by priority score, highest first", () => {
    const rooms = [room("a", 1, "1A", "101", 10), room("b", 1, "1A", "102", 50), room("c", 1, "1A", "103", 30)];
    expect(defaultRouteOrder(rooms).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by floor, then section, then room number — a walkable order", () => {
    const rooms = [
      room("f2", 2, "2A", "201", 20),
      room("f1b", 1, "1B", "116", 20),
      room("f1a", 1, "1A", "102", 20),
    ];
    expect(defaultRouteOrder(rooms).map((r) => r.id)).toEqual(["f1a", "f1b", "f2"]);
  });

  it("does not mutate the input array", () => {
    const rooms = [room("a", 1, "1A", "101", 10), room("b", 1, "1A", "102", 50)];
    const copy = [...rooms];
    defaultRouteOrder(rooms);
    expect(rooms).toEqual(copy);
  });
});

describe("routeLoadLabel", () => {
  it("is light at or below the typical low end", () => {
    expect(routeLoadLabel(TYPICAL_DAILY_ROOMS.low)).toBe("light");
    expect(routeLoadLabel(6)).toBe("light");
  });

  it("is typical within the 10-12 band", () => {
    expect(routeLoadLabel(11)).toBe("typical");
    expect(routeLoadLabel(TYPICAL_DAILY_ROOMS.high)).toBe("typical");
  });

  it("is heavy above the typical high end — the rare case worth flagging", () => {
    expect(routeLoadLabel(TYPICAL_DAILY_ROOMS.high + 1)).toBe("heavy");
    expect(routeLoadLabel(16)).toBe("heavy");
  });
});

describe("chunkByFloor", () => {
  it("groups contiguous same-floor runs without merging non-adjacent runs of the same floor", () => {
    const rooms = [
      room("a", 1, "1A", "101", 0), room("b", 1, "1A", "102", 0),
      room("c", 2, "2A", "201", 0),
      room("d", 1, "1B", "116", 0), // back to floor 1 later — should be its own chunk
    ];
    const chunks = chunkByFloor(rooms);
    expect(chunks.map((c) => [c.floor, c.items.map((i) => i.id)])).toEqual([
      [1, ["a", "b"]],
      [2, ["c"]],
      [1, ["d"]],
    ]);
  });

  it("returns one chunk per floor when the order is already floor-sorted", () => {
    const rooms = [room("a", 1, "1A", "101", 0), room("b", 2, "2A", "201", 0), room("c", 3, "3A", "301", 0)];
    expect(chunkByFloor(rooms)).toHaveLength(3);
  });

  it("handles an empty list", () => {
    expect(chunkByFloor([])).toEqual([]);
  });
});
