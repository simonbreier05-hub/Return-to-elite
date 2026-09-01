import type { Role, RoomStatus } from "./domain";

/**
 * The actor a transition is checked against. "guest" is NOT a member of
 * `Role`/`ROLES` in domain.ts — it can never be a `User.role`, never signs a
 * staff JWT, never passes a `requireRole([...])` check. It exists only here,
 * so a guest action (see /guest/[roomToken]) can be routed through the same
 * `checkTransition`/`applyStatusChange` gate as staff, restricted to the one
 * target it may ever set.
 */
export type ActorRole = Role | "guest";

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
export const ROLE_ALLOWED_TARGETS: Record<ActorRole, RoomStatus[]> = {
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
  // A guest (see /guest/[roomToken]) may only ever set their own room to
  // BLOCKED (Do Not Disturb) — never CLEAN/INSPECTED/OUT_OF_ORDER/etc.
  guest: ["BLOCKED"],
};

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: 403 | 409; error: string };

/**
 * Validate a requested status change. Returns a structured result so the API
 * layer can map it to HTTP 403 (forbidden for role) / 409 (illegal transition)
 * and write an audit entry either way.
 */
export function checkTransition(role: ActorRole, from: RoomStatus, to: RoomStatus): TransitionCheck {
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
    // BLOCKED→BLOCKED is the one legitimate no-op: re-confirming or
    // extending an active DND window (staff or guest). Every other
    // same-status call stays a conflict.
    if (to === "BLOCKED") return { ok: true };
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
