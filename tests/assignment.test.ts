import { describe, expect, it } from "vitest";
import { planAssignments, type AssignableAttendant, type AssignableRoom } from "@/lib/assignment/planAssignments";

/** Builds a floor of rooms: 29 per floor, sections A (01–15) and B (16–29). */
function buildFloor(floor: number, status = "DIRTY", minutes = 30): AssignableRoom[] {
  return Array.from({ length: 29 }, (_, i) => {
    const idx = i + 1;
    return {
      id: `r${floor}-${idx}`,
      number: `${floor}${String(idx).padStart(2, "0")}`,
      floor,
      section: `${floor}${idx <= 15 ? "A" : "B"}`,
      status,
      estimatedMinutes: minutes,
      priorityScore: 0,
    };
  });
}

const house = () => [1, 2, 3, 4, 5].flatMap((f) => buildFloor(f));

const attendants = (n: number): AssignableAttendant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Attendant ${i}` }));

describe("planAssignments — coverage", () => {
  it("assigns every room that needs an attendant", () => {
    const rooms = house();
    const plan = planAssignments(rooms, attendants(6));
    const assigned = plan.assignments.flatMap((a) => a.roomIds);
    expect(assigned).toHaveLength(rooms.length);
    expect(new Set(assigned).size).toBe(rooms.length); // no room twice
    expect(plan.unassigned).toHaveLength(0);
  });

  it("ignores rooms that do not need cleaning", () => {
    const rooms = [
      ...buildFloor(1, "DIRTY"),
      ...buildFloor(2, "INSPECTED"),
      ...buildFloor(3, "OUT_OF_ORDER"),
      ...buildFloor(4, "CLEAN"), // waiting for inspection, not for an attendant
    ];
    const plan = planAssignments(rooms, attendants(3));
    expect(plan.summary.totalRooms).toBe(29);
    expect(plan.assignments.flatMap((a) => a.roomIds)).toHaveLength(29);
  });

  it("picks up PICKUP, BLOCKED and IN_PROGRESS rooms too", () => {
    const rooms = [
      ...buildFloor(1, "PICKUP"),
      ...buildFloor(2, "BLOCKED"),
      ...buildFloor(3, "IN_PROGRESS"),
    ];
    const plan = planAssignments(rooms, attendants(3));
    expect(plan.summary.totalRooms).toBe(87);
  });

  it("reports everything as unassigned when nobody is on shift", () => {
    const plan = planAssignments(house(), []);
    expect(plan.assignments).toHaveLength(0);
    expect(plan.unassigned).toHaveLength(145);
    expect(plan.unassigned[0].reason).toMatch(/no attendant/i);
  });
});

describe("planAssignments — balance", () => {
  it("splits the workload evenly in minutes, not in room count", () => {
    // Floor 5 is all suites: same number of rooms, far more work.
    const rooms = [
      ...buildFloor(1, "DIRTY", 25),
      ...buildFloor(2, "DIRTY", 25),
      ...buildFloor(5, "DIRTY", 80),
    ];
    const plan = planAssignments(rooms, attendants(6));
    const minutes = plan.assignments.map((a) => a.totalMinutes);
    const spread = Math.max(...minutes) - Math.min(...minutes);
    // Within one long room of each other — good enough for a morning plan.
    expect(spread).toBeLessThanOrEqual(80);
    expect(plan.summary.spreadMinutes).toBe(spread);
  });

  it("gives every attendant work when there is enough to go round", () => {
    const plan = planAssignments(house(), attendants(6));
    for (const a of plan.assignments) expect(a.roomCount).toBeGreaterThan(0);
  });

  it("flags overbooking instead of silently dropping rooms", () => {
    // 145 rooms × 30 min = 4350 min across 2 attendants — far past one shift.
    const plan = planAssignments(house(), attendants(2), { capacityMinutes: 390 });
    expect(plan.assignments.flatMap((a) => a.roomIds)).toHaveLength(145);
    expect(plan.assignments.every((a) => a.overbooked)).toBe(true);
    expect(plan.assignments[0].load).toBeGreaterThan(1);
    expect(plan.assignments[0].reasons.join(" ")).toMatch(/over one shift/i);
  });
});

describe("planAssignments — walking distance & preferences", () => {
  it("honours a preferred section", () => {
    const plan = planAssignments(house(), [
      { id: "maria", name: "Maria", preferredSection: "2A" },
      { id: "aylin", name: "Aylin", preferredSection: "3A" },
      ...attendants(4),
    ]);
    const maria = plan.assignments.find((a) => a.attendantId === "maria")!;
    const aylin = plan.assignments.find((a) => a.attendantId === "aylin")!;
    expect(maria.sections).toContain("2A");
    expect(maria.reasons.join(" ")).toMatch(/preferred section 2A/i);
    expect(aylin.sections).toContain("3A");
  });

  it("keeps every attendant on a short walk, at any team size", () => {
    // The regression this guards: an earlier planner balanced room by room and
    // handed one attendant work on all five floors.
    for (const size of [2, 3, 4, 5, 6, 8, 10]) {
      const plan = planAssignments(house(), attendants(size));
      const roomsEach = 145 / size;
      // A floor holds 29 rooms, so a round can only reach as many floors as it
      // has rooms to fill — plus one for the floor it starts partway through.
      const reachable = Math.ceil(roomsEach / 29) + 1;
      for (const a of plan.assignments) {
        expect(a.floors.length).toBeLessThanOrEqual(reachable);
      }
    }
  });

  it("gives each attendant a contiguous run of the house", () => {
    const plan = planAssignments(house(), attendants(5));
    for (const a of plan.assignments) {
      // Floors touched must be consecutive — no jumping from 1 to 4.
      for (let i = 1; i < a.floors.length; i++) {
        expect(a.floors[i] - a.floors[i - 1]).toBe(1);
      }
    }
  });

  it("does not send anyone across the house just to even out long rooms", () => {
    // Floors 1 and 2 are quick rooms, floor 5 is all suites — the mix that
    // previously produced a five-floor round.
    const rooms = [...buildFloor(1, "DIRTY", 25), ...buildFloor(2, "DIRTY", 25), ...buildFloor(5, "DIRTY", 80)];
    const plan = planAssignments(rooms, attendants(4));
    for (const a of plan.assignments) expect(a.floors.length).toBeLessThanOrEqual(2);
  });

  it("hands out urgent rooms before the rest of their section", () => {
    const rooms = buildFloor(1).map((r, i) => ({
      ...r,
      priorityScore: r.number === "108" ? 200 : i, // 108 is the urgent one
    }));
    const plan = planAssignments(rooms, attendants(1));
    expect(plan.assignments[0].roomIds[0]).toBe(rooms.find((r) => r.number === "108")!.id);
  });
});

describe("planAssignments — explainability & determinism", () => {
  it("returns the same plan for the same input", () => {
    const rooms = house();
    const staff = attendants(5);
    const a = planAssignments(rooms, staff);
    const b = planAssignments(rooms, staff);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("explains every assignment in plain language", () => {
    const plan = planAssignments(house(), attendants(6));
    for (const a of plan.assignments) {
      expect(a.reasons.length).toBeGreaterThan(0);
      for (const r of a.reasons) expect(r.length).toBeGreaterThan(10);
      expect(a.reasons.join(" ")).toMatch(/\d+ rooms/);
    }
  });

  it("summary totals match the assignments", () => {
    const plan = planAssignments(house(), attendants(4));
    const minutes = plan.assignments.reduce((s, a) => s + a.totalMinutes, 0);
    const count = plan.assignments.reduce((s, a) => s + a.roomCount, 0);
    expect(minutes).toBe(plan.summary.totalMinutes);
    expect(count).toBe(plan.summary.totalRooms);
    expect(plan.summary.averageMinutes).toBe(Math.round(plan.summary.totalMinutes / 4));
  });
});
