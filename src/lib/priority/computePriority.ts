/**
 * Explainable priority engine.
 *
 * Pure function — no I/O, no DB — so it is trivially unit-testable
 * (tests/priority.test.ts) and every score ships with a human-readable
 * "why" breakdown suitable for an academic report.
 *
 * Signals (weighted, tunable via PRIORITY_WEIGHTS):
 *  1. front office "needed now" / confirmed early ETA
 *  2. VIP arrival
 *  3. checkout with same-day re-arrival beats stayovers
 *  4. concierge excursion window (guest currently out => clean now)
 *  5. DND/BLOCKED age — escalates the longer a room stays blocked
 *  6. route/section proximity to the attendant (minimize walking)
 */

export interface PriorityRoomInput {
  id: string;
  number: string;
  floor: number;
  section: string;
  status: string;
  isCheckoutToday: boolean;
  blockedSince?: Date | null;
}

export interface PriorityArrivalInput {
  eta?: Date | null;
  vip: boolean;
  earlyCheckIn: boolean;
  neededNow: boolean;
}

export interface PriorityExcursionInput {
  startsAt: Date;
  endsAt: Date;
}

export interface PriorityContext {
  now: Date;
  /** EXPECTED arrivals booked onto this room today. */
  arrivals: PriorityArrivalInput[];
  /** Concierge out-of-house windows for this room. */
  excursions: PriorityExcursionInput[];
  /** Section the attendant is currently working in (route optimization). */
  attendantSection?: string | null;
  /** Floor the attendant is currently on (route optimization). */
  attendantFloor?: number | null;
  /** Escalation threshold for blocked-room aging, minutes. */
  blockedRecheckMinutes?: number;
  /**
   * House-specific weights, set by the duty manager. Only the values that
   * differ need to be passed; anything omitted keeps the default. A resort
   * with heavy excursion traffic weighs that window differently to a city
   * hotel living off early check-ins, and that is a management decision, not
   * a code change.
   */
  weights?: Partial<PriorityWeights>;
}

export interface PriorityReason {
  signal: string;
  points: number;
  reason: string;
}

export interface PriorityResult {
  score: number;
  reasons: PriorityReason[];
}

/** Mutable mirror of the defaults — the stored, per-house values are editable. */
export type PriorityWeights = { -readonly [K in keyof typeof PRIORITY_WEIGHTS]: number };

export const PRIORITY_WEIGHTS = {
  neededNow: 100,
  earlyEtaSoon: 60, // confirmed ETA within the soon-window
  earlyCheckInFlag: 25,
  vip: 40,
  checkoutWithArrival: 35, // same-day turn beats stayover
  checkoutToday: 15,
  excursionActive: 30, // guest out of house right now
  excursionEndingSoon: 15, // extra urgency: window closes within 60 min
  blockedAgePerInterval: 10, // per elapsed recheck-interval while BLOCKED
  blockedAgeCap: 40,
  sameSection: 12, // route proximity
  sameFloor: 6,
  etaSoonWindowMinutes: 90,
} as const;

/** Statuses that still need housekeeping work and therefore compete for priority. */
const ACTIONABLE = new Set(["DIRTY", "IN_PROGRESS", "PICKUP", "BLOCKED", "CLEAN"]);

export function computePriority(room: PriorityRoomInput, ctx: PriorityContext): PriorityResult {
  const reasons: PriorityReason[] = [];
  const W: PriorityWeights = ctx.weights ? { ...PRIORITY_WEIGHTS, ...ctx.weights } : PRIORITY_WEIGHTS;
  const now = ctx.now.getTime();

  if (!ACTIONABLE.has(room.status)) {
    return {
      score: 0,
      reasons: [{ signal: "status", points: 0, reason: `Room is ${room.status} — no cleaning action pending.` }],
    };
  }

  // (1) Front office demand
  const arrivals = ctx.arrivals ?? [];
  if (arrivals.some((a) => a.neededNow)) {
    reasons.push({ signal: "needed_now", points: W.neededNow, reason: "Front office flagged: room needed NOW." });
  }
  const soonMs = W.etaSoonWindowMinutes * 60_000;
  const etaSoon = arrivals.find((a) => a.eta && a.eta.getTime() - now <= soonMs && a.eta.getTime() - now > -soonMs);
  if (etaSoon?.eta) {
    const mins = Math.round((etaSoon.eta.getTime() - now) / 60_000);
    reasons.push({
      signal: "eta_soon",
      points: W.earlyEtaSoon,
      reason: mins >= 0 ? `Confirmed arrival ETA in ${mins} min.` : `Arrival ETA passed ${-mins} min ago — guest may be waiting.`,
    });
  }
  if (arrivals.some((a) => a.earlyCheckIn)) {
    reasons.push({ signal: "early_check_in", points: W.earlyCheckInFlag, reason: "Early check-in requested." });
  }

  // (2) VIP
  if (arrivals.some((a) => a.vip)) {
    reasons.push({ signal: "vip", points: W.vip, reason: "VIP guest arriving on this room." });
  }

  // (3) Checkout / same-day turn
  if (room.isCheckoutToday && arrivals.length > 0) {
    reasons.push({
      signal: "same_day_turn",
      points: W.checkoutWithArrival,
      reason: "Checkout with same-day re-arrival — turn before stayovers.",
    });
  } else if (room.isCheckoutToday) {
    reasons.push({ signal: "checkout", points: W.checkoutToday, reason: "Due-out today — return to inventory." });
  }

  // (4) Concierge excursion window
  const active = (ctx.excursions ?? []).find((e) => e.startsAt.getTime() <= now && e.endsAt.getTime() > now);
  if (active) {
    reasons.push({
      signal: "excursion_window",
      points: W.excursionActive,
      reason: `Guest out of house until ${active.endsAt.toISOString().slice(11, 16)} — ideal cleaning window.`,
    });
    if (active.endsAt.getTime() - now <= 60 * 60_000) {
      reasons.push({
        signal: "excursion_closing",
        points: W.excursionEndingSoon,
        reason: "Excursion window closes within 60 min — clean before guest returns.",
      });
    }
  }

  // (5) DND / BLOCKED aging
  if (room.status === "BLOCKED" && room.blockedSince) {
    const interval = (ctx.blockedRecheckMinutes ?? 20) * 60_000;
    const elapsed = now - room.blockedSince.getTime();
    const intervals = Math.floor(elapsed / interval);
    if (intervals > 0) {
      const points = Math.min(intervals * W.blockedAgePerInterval, W.blockedAgeCap);
      reasons.push({
        signal: "blocked_age",
        points,
        reason: `Blocked for ${Math.round(elapsed / 60_000)} min (${intervals}× re-check interval) — needs re-check.`,
      });
    }
  }

  // (6) Route / section proximity
  if (ctx.attendantSection && room.section === ctx.attendantSection) {
    reasons.push({ signal: "route_section", points: W.sameSection, reason: `Same section (${room.section}) as attendant — minimal walking.` });
  } else if (ctx.attendantFloor != null && room.floor === ctx.attendantFloor) {
    reasons.push({ signal: "route_floor", points: W.sameFloor, reason: `Same floor (${room.floor}) as attendant.` });
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  return { score, reasons };
}
