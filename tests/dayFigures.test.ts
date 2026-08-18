import { describe, expect, it } from "vitest";
import {
  checkDayFigures,
  classifyDepartures,
  defaultDayFigures,
  stayoversFrom,
  type ClassifiableRoom,
} from "@/lib/assignment/dayFigures";

const room = (n: string, over: Partial<ClassifiableRoom> = {}): ClassifiableRoom => ({
  id: `id-${n}`,
  number: n,
  isCheckoutToday: false,
  occupancy: "OCCUPIED",
  priorityScore: 0,
  ...over,
});

describe("day figures — reading the night audit", () => {
  it("prefills from what the live data already knows", () => {
    const rooms = [
      room("101", { isCheckoutToday: true }),
      room("102", { isCheckoutToday: true }),
      room("103"),
      room("104"),
      room("105", { occupancy: "VACANT" }),
    ];
    const figures = defaultDayFigures(rooms, 7);
    expect(figures.departures).toBe(2);
    // 4 occupied − 2 leaving = 2 stayovers, plus 7 arrivals tonight.
    expect(figures.eveningOccupancy).toBe(9);
    expect(figures.arrivals).toBe(7);
    expect(stayoversFrom(figures)).toBe(2);
  });

  it("never reports negative stayovers when everyone checks out", () => {
    const rooms = [room("101", { isCheckoutToday: true }), room("102", { isCheckoutToday: true })];
    const figures = defaultDayFigures(rooms, 0);
    expect(stayoversFrom(figures)).toBe(0);
    expect(figures.eveningOccupancy).toBe(0);
  });
});

describe("day figures — which rooms become departure cleans", () => {
  const rooms = [
    room("101", { isCheckoutToday: true }),
    room("205", { priorityScore: 180 }),
    room("310", { priorityScore: 40 }),
    room("412", { isCheckoutToday: true }),
    room("501", { priorityScore: 90 }),
  ];

  it("takes the known checkouts before anything else", () => {
    const chosen = classifyDepartures(rooms, 2);
    expect([...chosen].sort()).toEqual(["id-101", "id-412"]);
  });

  it("fills beyond the known checkouts with the most urgent rooms", () => {
    const chosen = classifyDepartures(rooms, 4);
    expect(chosen.has("id-101")).toBe(true);
    expect(chosen.has("id-412")).toBe(true);
    expect(chosen.has("id-205")).toBe(true); // score 180
    expect(chosen.has("id-501")).toBe(true); // score 90
    expect(chosen.has("id-310")).toBe(false); // score 40, the least urgent
  });

  it("a supervisor's lower figure never un-flags a known checkout first", () => {
    // Asking for one departure must still pick a real due-out room.
    const chosen = classifyDepartures(rooms, 1);
    expect(chosen.size).toBe(1);
    const picked = [...chosen][0];
    expect(["id-101", "id-412"]).toContain(picked);
  });

  it("clamps to what exists and handles the extremes", () => {
    expect(classifyDepartures(rooms, 0).size).toBe(0);
    expect(classifyDepartures(rooms, -5).size).toBe(0);
    expect(classifyDepartures(rooms, 999).size).toBe(rooms.length);
  });

  it("is deterministic for the same figures", () => {
    const a = [...classifyDepartures(rooms, 3)].sort();
    const b = [...classifyDepartures(rooms, 3)].sort();
    expect(a).toEqual(b);
  });
});

describe("day figures — warnings that stop a silent mistake", () => {
  it("flags more departures than there are rooms left to clean", () => {
    const w = checkDayFigures({ departures: 90, arrivals: 10, eveningOccupancy: 40 }, 145, 60);
    expect(w.map((x) => x.field)).toContain("departures");
    expect(w.find((x) => x.field === "departures")!.message).toContain("60");
  });

  it("flags an evening occupancy larger than the house", () => {
    const w = checkDayFigures({ departures: 10, arrivals: 10, eveningOccupancy: 200 }, 145, 60);
    expect(w.map((x) => x.field)).toContain("eveningOccupancy");
  });

  it("flags more arrivals than rooms occupied tonight", () => {
    const w = checkDayFigures({ departures: 10, arrivals: 50, eveningOccupancy: 30 }, 145, 60);
    expect(w.map((x) => x.field)).toContain("arrivals");
  });

  it("stays quiet on a plausible day", () => {
    expect(checkDayFigures({ departures: 38, arrivals: 41, eveningOccupancy: 96 }, 145, 92)).toHaveLength(0);
  });
});
