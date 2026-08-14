import { describe, expect, it } from "vitest";
import { checkTransition, LEGAL_TRANSITIONS, ROLE_ALLOWED_TARGETS } from "@/lib/stateMachine";
import { ROLES, ROOM_STATUSES, type Role, type RoomStatus } from "@/lib/domain";

describe("state machine — legal transitions", () => {
  it("allows the happy path DIRTY → IN_PROGRESS → CLEAN → INSPECTED (as supervisor)", () => {
    expect(checkTransition("supervisor", "DIRTY", "IN_PROGRESS")).toEqual({ ok: true });
    expect(checkTransition("supervisor", "IN_PROGRESS", "CLEAN")).toEqual({ ok: true });
    expect(checkTransition("supervisor", "CLEAN", "INSPECTED")).toEqual({ ok: true });
  });

  it("rejects skipping states (DIRTY → CLEAN, DIRTY → INSPECTED)", () => {
    const skip1 = checkTransition("supervisor", "DIRTY", "CLEAN");
    expect(skip1.ok).toBe(false);
    if (!skip1.ok) expect(skip1.code).toBe(409);
    const skip2 = checkTransition("supervisor", "DIRTY", "INSPECTED");
    expect(skip2.ok).toBe(false);
    if (!skip2.ok) expect(skip2.code).toBe(409);
  });

  it("rejects no-op transitions (same status)", () => {
    const res = checkTransition("supervisor", "CLEAN", "CLEAN");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(409);
  });

  it("supports supervisor rework: CLEAN → PICKUP → IN_PROGRESS", () => {
    expect(checkTransition("supervisor", "CLEAN", "PICKUP")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "PICKUP", "IN_PROGRESS")).toEqual({ ok: true });
  });

  it("supports blocking and unblocking", () => {
    expect(checkTransition("room_attendant", "DIRTY", "BLOCKED")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "IN_PROGRESS", "BLOCKED")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "BLOCKED", "DIRTY")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "BLOCKED", "IN_PROGRESS")).toEqual({ ok: true });
  });

  it("cannot release a BLOCKED room directly", () => {
    const res = checkTransition("supervisor", "BLOCKED", "INSPECTED");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(409);
  });

  it("INSPECTED returns to DIRTY on checkout, and supervisor can set OOO/OOS from anywhere", () => {
    expect(checkTransition("supervisor", "INSPECTED", "DIRTY")).toEqual({ ok: true });
    for (const from of ROOM_STATUSES.filter((s) => s !== "OUT_OF_ORDER")) {
      expect(checkTransition("supervisor", from, "OUT_OF_ORDER").ok).toBe(true);
    }
    expect(checkTransition("supervisor", "OUT_OF_ORDER", "DIRTY")).toEqual({ ok: true });
  });

  it("every declared transition target is a valid status", () => {
    for (const [from, targets] of Object.entries(LEGAL_TRANSITIONS)) {
      expect(ROOM_STATUSES).toContain(from as RoomStatus);
      for (const to of targets) expect(ROOM_STATUSES).toContain(to);
    }
  });
});

describe("CRITICAL permission rule — only supervisor/duty_manager may set INSPECTED", () => {
  const nonReleasing: Role[] = ["room_attendant", "front_office", "concierge", "engineering"];

  it.each(nonReleasing)("%s gets 403 when trying to set INSPECTED", (role) => {
    const res = checkTransition(role, "CLEAN", "INSPECTED");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe(403);
      expect(res.error).toMatch(/supervisor|duty manager/i);
    }
  });

  it.each(["supervisor", "duty_manager"] as Role[])("%s may set INSPECTED from CLEAN", (role) => {
    expect(checkTransition(role, "CLEAN", "INSPECTED")).toEqual({ ok: true });
  });

  it("statically, INSPECTED only appears in supervisor & duty_manager allow-lists", () => {
    for (const role of ROLES) {
      const allowed = ROLE_ALLOWED_TARGETS[role].includes("INSPECTED");
      expect(allowed).toBe(role === "supervisor" || role === "duty_manager");
    }
  });
});

describe("permission matrix — front office & concierge", () => {
  it.each(["front_office", "concierge"] as Role[])("%s may not change any cleaning status", (role) => {
    expect(ROLE_ALLOWED_TARGETS[role]).toHaveLength(0);
    for (const to of ROOM_STATUSES) {
      const res = checkTransition(role, "DIRTY", to);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe(403);
    }
  });
});

describe("permission matrix — room attendant", () => {
  it("may set IN_PROGRESS, CLEAN, BLOCKED and report defects", () => {
    expect(checkTransition("room_attendant", "DIRTY", "IN_PROGRESS")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "IN_PROGRESS", "CLEAN")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "IN_PROGRESS", "BLOCKED")).toEqual({ ok: true });
    expect(checkTransition("room_attendant", "IN_PROGRESS", "DEFECT_REPORTED")).toEqual({ ok: true });
  });

  it("may NOT set PICKUP (rework is a supervisor decision)", () => {
    const res = checkTransition("room_attendant", "CLEAN", "PICKUP");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(403);
  });

  it("may NOT set OUT_OF_ORDER / OUT_OF_SERVICE", () => {
    for (const to of ["OUT_OF_ORDER", "OUT_OF_SERVICE"] as const) {
      const res = checkTransition("room_attendant", "DIRTY", to);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe(403);
    }
  });
});
