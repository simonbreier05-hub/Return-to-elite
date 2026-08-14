import type { Role, RoomStatus } from "./domain";

/**
 * Room status state machine + role permission matrix.
 *
 * Both checks are enforced SERVER-SIDE in the status API route
 * (src/app/api/rooms/[id]/status/route.ts) and unit-tested in
 * tests/stateMachine.test.ts. The UI only mirrors these rules for UX.
 *
 * Core diagram:
 *   DIRTY → IN_PROGRESS → CLEAN → INSPECTED
 *                    ↑        └→ PICKUP → IN_PROGRESS   (supervisor rework)
 *   DIRTY/IN_PROGRESS ↔ BLOCKED (reason + timer)
 *   * → DEFECT_REPORTED → DIRTY/IN_PROGRESS             (via work order)
 *   supervisor/duty_manager: * → OUT_OF_ORDER / OUT_OF_SERVICE → DIRTY
 *   DIRTY ↔ GREEN_OPT_OUT
 *   INSPECTED → DIRTY (next checkout / PMS event)
 */

/** Legal transitions: from-status → set of allowed target statuses. */
export const LEGAL_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  DIRTY: ["IN_PROGRESS", "BLOCKED", "DEFECT_REPORTED", "GREEN_OPT_OUT", "OUT_OF_ORDER", "OUT_OF_SERVICE"],
  IN_PROGRESS: ["CLEAN", "BLOCKED", "DEFECT_REPORTED", "DIRTY", "OUT_OF_ORDER", "OUT_OF_SERVICE"],
  CLEAN: ["INSPECTED", "PICKUP", "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE"],
  INSPECTED: ["DIRTY", "OUT_OF_ORDER", "OUT_OF_SERVICE"], // new checkout / PMS event resets to DIRTY
  PICKUP: ["IN_PROGRESS", "BLOCKED", "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE"],
  BLOCKED: ["DIRTY", "IN_PROGRESS", "OUT_OF_ORDER", "OUT_OF_SERVICE"], // unblock resumes cleaning
  DEFECT_REPORTED: ["DIRTY", "IN_PROGRESS", "OUT_OF_ORDER", "OUT_OF_SERVICE"], // after work order resolution
  OUT_OF_ORDER: ["DIRTY", "OUT_OF_SERVICE"],
  OUT_OF_SERVICE: ["DIRTY", "OUT_OF_ORDER"],
  GREEN_OPT_OUT: ["DIRTY", "IN_PROGRESS", "OUT_OF_ORDER", "OUT_OF_SERVICE"],
};

/**
 * Which target statuses each role may set.
 * CRITICAL RULE: only supervisor + duty_manager may set INSPECTED (release a
 * room as sellable). front_office & concierge may not change cleaning status
 * at all.
 */
export const ROLE_ALLOWED_TARGETS: Record<Role, RoomStatus[]> = {
  room_attendant: ["IN_PROGRESS", "CLEAN", "BLOCKED", "DEFECT_REPORTED", "DIRTY", "GREEN_OPT_OUT"],
  supervisor: [...([
    "DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "PICKUP", "BLOCKED",
    "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT",
  ] as RoomStatus[])],
  duty_manager: [...([
    "DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "PICKUP", "BLOCKED",
    "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT",
  ] as RoomStatus[])],
  engineering: ["DEFECT_REPORTED"], // may flag a defect; everything else via work orders
  front_office: [], // MUST NOT change housekeeping status
  concierge: [], // MUST NOT change housekeeping status
};

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: 403 | 409; error: string };

/**
 * Validate a requested status change. Returns a structured result so the API
 * layer can map it to HTTP 403 (forbidden for role) / 409 (illegal transition)
 * and write an audit entry either way.
 */
export function checkTransition(role: Role, from: RoomStatus, to: RoomStatus): TransitionCheck {
  if (!ROLE_ALLOWED_TARGETS[role].includes(to)) {
    return {
      ok: false,
      code: 403,
      error:
        to === "INSPECTED"
          ? "Only a supervisor or duty manager may release a room (set INSPECTED)."
          : `Role '${role}' is not permitted to set status '${to}'.`,
    };
  }
  if (from === to) {
    return { ok: false, code: 409, error: `Room is already '${from}'.` };
  }
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    return { ok: false, code: 409, error: `Illegal transition ${from} → ${to}.` };
  }
  return { ok: true };
}

/** Transitions that require extra payload fields (validated with Zod in the route). */
export const REQUIRES_BLOCK_REASON: RoomStatus = "BLOCKED";
export const REQUIRES_REWORK_NOTE: RoomStatus = "PICKUP";
export const REQUIRES_OOO_END: RoomStatus = "OUT_OF_ORDER";
