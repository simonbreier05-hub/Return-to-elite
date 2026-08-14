import { describe, expect, it } from "vitest";
import {
  computePriority,
  PRIORITY_WEIGHTS,
  type PriorityContext,
  type PriorityRoomInput,
} from "@/lib/priority/computePriority";
import { predictCleaningMinutes } from "@/lib/priority/predictCleaningMinutes";

const now = new Date("2026-08-14T10:00:00Z");
const min = (n: number) => new Date(now.getTime() + n * 60_000);

const baseRoom: PriorityRoomInput = {
  id: "r1",
  number: "204",
  floor: 2,
  section: "2A",
  status: "DIRTY",
  isCheckoutToday: false,
};

const emptyCtx: PriorityContext = { now, arrivals: [], excursions: [] };

describe("computePriority — explainable scoring", () => {
  it("scores 0 with a reason for non-actionable rooms", () => {
    const res = computePriority({ ...baseRoom, status: "INSPECTED" }, emptyCtx);
    expect(res.score).toBe(0);
    expect(res.reasons[0].reason).toContain("INSPECTED");
  });

  it("gives 'needed now' the highest single weight", () => {
    const res = computePriority(baseRoom, {
      ...emptyCtx,
      arrivals: [{ eta: null, vip: false, earlyCheckIn: false, neededNow: true }],
    });
    expect(res.score).toBeGreaterThanOrEqual(PRIORITY_WEIGHTS.neededNow);
    expect(res.reasons.some((r) => r.signal === "needed_now")).toBe(true);
    const max = Math.max(
      PRIORITY_WEIGHTS.earlyEtaSoon, PRIORITY_WEIGHTS.vip,
      PRIORITY_WEIGHTS.checkoutWithArrival, PRIORITY_WEIGHTS.excursionActive,
      PRIORITY_WEIGHTS.blockedAgeCap, PRIORITY_WEIGHTS.sameSection
    );
    expect(PRIORITY_WEIGHTS.neededNow).toBeGreaterThan(max);
  });

  it("adds ETA + VIP + early check-in signals with readable reasons", () => {
    const res = computePriority(baseRoom, {
      ...emptyCtx,
      arrivals: [{ eta: min(30), vip: true, earlyCheckIn: true, neededNow: false }],
    });
    const signals = res.reasons.map((r) => r.signal);
    expect(signals).toEqual(expect.arrayContaining(["eta_soon", "vip", "early_check_in"]));
    expect(res.reasons.find((r) => r.signal === "eta_soon")!.reason).toContain("30 min");
    expect(res.score).toBe(
      PRIORITY_WEIGHTS.earlyEtaSoon + PRIORITY_WEIGHTS.vip + PRIORITY_WEIGHTS.earlyCheckInFlag
    );
  });

  it("ranks checkout-with-same-day-arrival above plain stayover checkout", () => {
    const turn = computePriority(
      { ...baseRoom, isCheckoutToday: true },
      { ...emptyCtx, arrivals: [{ eta: min(300), vip: false, earlyCheckIn: false, neededNow: false }] }
    );
    const plain = computePriority({ ...baseRoom, isCheckoutToday: true }, emptyCtx);
    expect(turn.score).toBeGreaterThan(plain.score);
    expect(turn.reasons.some((r) => r.signal === "same_day_turn")).toBe(true);
  });

  it("prioritizes rooms whose guest is currently out on an excursion", () => {
    const res = computePriority(baseRoom, {
      ...emptyCtx,
      excursions: [{ startsAt: min(-30), endsAt: min(45) }],
    });
    const signals = res.reasons.map((r) => r.signal);
    expect(signals).toContain("excursion_window");
    expect(signals).toContain("excursion_closing"); // ends within 60 min
  });

  it("escalates BLOCKED rooms with age, capped", () => {
    const young = computePriority(
      { ...baseRoom, status: "BLOCKED", blockedSince: min(-10) },
      { ...emptyCtx, blockedRecheckMinutes: 20 }
    );
    expect(young.reasons.some((r) => r.signal === "blocked_age")).toBe(false);

    const old = computePriority(
      { ...baseRoom, status: "BLOCKED", blockedSince: min(-45) },
      { ...emptyCtx, blockedRecheckMinutes: 20 }
    );
    const blockedReason = old.reasons.find((r) => r.signal === "blocked_age");
    expect(blockedReason).toBeDefined();
    expect(blockedReason!.points).toBe(2 * PRIORITY_WEIGHTS.blockedAgePerInterval);

    const ancient = computePriority(
      { ...baseRoom, status: "BLOCKED", blockedSince: min(-6000) },
      { ...emptyCtx, blockedRecheckMinutes: 20 }
    );
    expect(ancient.reasons.find((r) => r.signal === "blocked_age")!.points).toBe(PRIORITY_WEIGHTS.blockedAgeCap);
  });

  it("adds route proximity: same section beats same floor", () => {
    const sameSection = computePriority(baseRoom, { ...emptyCtx, attendantSection: "2A", attendantFloor: 2 });
    expect(sameSection.reasons.some((r) => r.signal === "route_section")).toBe(true);
    const sameFloor = computePriority(baseRoom, { ...emptyCtx, attendantSection: "2B", attendantFloor: 2 });
    expect(sameFloor.reasons.some((r) => r.signal === "route_floor")).toBe(true);
    expect(sameSection.score).toBeGreaterThan(sameFloor.score);
  });

  it("score always equals the sum of its explained parts (transparency invariant)", () => {
    const res = computePriority(
      { ...baseRoom, isCheckoutToday: true, status: "BLOCKED", blockedSince: min(-60) },
      {
        now,
        arrivals: [{ eta: min(20), vip: true, earlyCheckIn: true, neededNow: true }],
        excursions: [{ startsAt: min(-10), endsAt: min(30) }],
        attendantSection: "2A",
        blockedRecheckMinutes: 20,
      }
    );
    expect(res.score).toBe(res.reasons.reduce((s, r) => s + r.points, 0));
    for (const r of res.reasons) expect(r.reason.length).toBeGreaterThan(5);
  });
});

describe("predictCleaningMinutes — baseline ML hook", () => {
  it("scales with room type", () => {
    const std = predictCleaningMinutes({ type: "STANDARD", isCheckoutToday: true });
    const suite = predictCleaningMinutes({ type: "SUITE", isCheckoutToday: true });
    const pent = predictCleaningMinutes({ type: "PENTHOUSE", isCheckoutToday: true });
    expect(std).toBeLessThan(suite);
    expect(suite).toBeLessThan(pent);
  });

  it("checkout clean takes longer than stayover service", () => {
    const checkout = predictCleaningMinutes({ type: "DELUXE", isCheckoutToday: true });
    const stayover = predictCleaningMinutes({ type: "DELUXE", isCheckoutToday: false });
    expect(checkout).toBeGreaterThan(stayover);
  });

  it("longer stays and more guests increase the estimate", () => {
    const short = predictCleaningMinutes({ type: "STANDARD", isCheckoutToday: true }, { stayLengthNights: 1 });
    const long = predictCleaningMinutes({ type: "STANDARD", isCheckoutToday: true }, { stayLengthNights: 7 });
    expect(long).toBeGreaterThan(short);
    const family = predictCleaningMinutes({ type: "STANDARD", isCheckoutToday: true }, { adults: 2, children: 2 });
    expect(family).toBeGreaterThan(short);
  });

  it("respects a per-room baseline override", () => {
    const custom = predictCleaningMinutes({ type: "STANDARD", isCheckoutToday: false, baseCleanMinutes: 60 });
    const def = predictCleaningMinutes({ type: "STANDARD", isCheckoutToday: false });
    expect(custom).toBeGreaterThan(def);
  });
});
