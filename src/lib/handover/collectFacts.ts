/**
 * Shift handover, part one: the facts.
 *
 * Everything countable is computed here, in ordinary code, from the audit log
 * and the current board. No model ever produces a number, a room number or a
 * name — it only gets this object and turns it into prose.
 *
 * That split is the whole safety argument. A language model that invents
 * "room 412 is still blocked" when it is not would be worse than no handover
 * at all, because the evening supervisor would act on it. So the model is
 * never in a position to invent one: it receives the facts and is asked to
 * phrase them.
 */

export interface RoomRef {
  number: string;
  floor: number;
  status: string;
  minutesInStatus: number;
  blockReason?: string | null;
  reworkNote?: string | null;
  assignedTo?: string | null;
}

export interface HandoverFacts {
  generatedAt: Date;
  /** Hours of board activity the summary covers. */
  windowHours: number;

  progress: {
    totalRooms: number;
    released: number;
    sellable: number;
    percentReleased: number;
    stillDirty: number;
    inProgress: number;
    waitingForInspection: number;
  };

  /** Rooms that need a decision or a follow-up from the incoming shift. */
  attention: {
    blocked: RoomRef[];
    rework: RoomRef[];
    outOfOrder: RoomRef[];
    longestWaitingForInspection: RoomRef[];
  };

  arrivals: {
    expected: number;
    readyNow: number;
    vipPending: { room: string; guest: string; eta: string | null }[];
    atRisk: { room: string; guest: string; eta: string | null; status: string }[];
  };

  engineering: {
    openWorkOrders: number;
    unacknowledged: number;
    resolvedInWindow: number;
    open: { room: string; category: string; note: string; status: string }[];
  };

  activity: {
    statusChanges: number;
    roomsReleasedInWindow: number;
    deniedAttempts: number;
    byAttendant: { name: string; rooms: number }[];
  };

  notes: { room: string; author: string; role: string; body: string }[];
}

/** Minutes between two instants, never negative, rounded. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/** DOUBLE_LOCKED reads as machine output in a sentence; "double locked" does not. */
export function humanise(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/_/g, " ");
}

/**
 * Turns the facts into the flat lines a summary is built from. Used by the
 * local generator directly, and handed to a language model as its only source
 * of truth.
 */
export function factsToBullets(f: HandoverFacts): string[] {
  const lines: string[] = [];
  const p = f.progress;

  lines.push(
    `${p.released} of ${p.sellable} sellable rooms released (${p.percentReleased}%). ` +
      `${p.waitingForInspection} waiting for inspection, ${p.inProgress} being cleaned, ${p.stillDirty} not started.`
  );

  if (f.attention.blocked.length) {
    lines.push(
      `Blocked: ${f.attention.blocked
        .map((r) => `${r.number} (${humanise(r.blockReason) || "blocked"}, ${r.minutesInStatus} min)`)
        .join(", ")}.`
    );
  }
  if (f.attention.rework.length) {
    lines.push(`Sent back for rework: ${f.attention.rework.map((r) => r.number).join(", ")}.`);
  }
  if (f.attention.outOfOrder.length) {
    lines.push(`Out of order: ${f.attention.outOfOrder.map((r) => r.number).join(", ")}.`);
  }
  if (f.attention.longestWaitingForInspection.length) {
    const w = f.attention.longestWaitingForInspection[0];
    lines.push(`Longest wait for inspection: ${w.number}, ${w.minutesInStatus} min.`);
  }

  lines.push(
    `${f.arrivals.expected} arrivals expected, ${f.arrivals.readyNow} of their rooms already released.`
  );
  if (f.arrivals.atRisk.length) {
    lines.push(
      `Arrivals at risk: ${f.arrivals.atRisk
        .map((a) => `${a.room} for ${a.guest}${a.eta ? ` at ${a.eta}` : ""} (room ${a.status})`)
        .join(", ")}.`
    );
  }
  if (f.arrivals.vipPending.length) {
    lines.push(
      `VIP rooms not yet released: ${f.arrivals.vipPending.map((v) => `${v.room} (${v.guest})`).join(", ")}.`
    );
  }

  if (f.engineering.openWorkOrders > 0) {
    lines.push(
      `${f.engineering.openWorkOrders} open work orders, ${f.engineering.unacknowledged} not yet acknowledged: ` +
        f.engineering.open.map((w) => `${w.room} ${humanise(w.category)} (${humanise(w.status)})`).join(", ") +
        "."
    );
  }
  if (f.engineering.resolvedInWindow > 0) {
    lines.push(`${f.engineering.resolvedInWindow} work orders resolved during the shift.`);
  }

  if (f.activity.byAttendant.length) {
    lines.push(
      `Rooms handled: ${f.activity.byAttendant.map((a) => `${a.name} ${a.rooms}`).join(", ")}.`
    );
  }
  if (f.activity.deniedAttempts > 0) {
    lines.push(
      `${f.activity.deniedAttempts} status changes were refused by the system during the shift — worth a look in the audit trail.`
    );
  }

  for (const n of f.notes.slice(0, 5)) {
    lines.push(`Note on ${n.room} from ${n.author} (${n.role.replace(/_/g, " ")}): ${n.body}`);
  }

  return lines;
}
