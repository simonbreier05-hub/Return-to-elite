import { describe, expect, it } from "vitest";
import { factsToBullets, minutesBetween, type HandoverFacts } from "@/lib/handover/collectFacts";
import { __localWriterForTests as localWriter } from "@/lib/handover/generate";

const at = new Date("2026-08-18T14:00:00Z");

const facts = (over: Partial<HandoverFacts> = {}): HandoverFacts => ({
  generatedAt: at,
  windowHours: 8,
  progress: {
    totalRooms: 145,
    released: 96,
    sellable: 143,
    percentReleased: 67,
    stillDirty: 21,
    inProgress: 9,
    waitingForInspection: 14,
  },
  attention: {
    blocked: [
      { number: "302", floor: 3, status: "BLOCKED", minutesInStatus: 47, blockReason: "DND" },
      { number: "410", floor: 4, status: "BLOCKED", minutesInStatus: 12, blockReason: "DOUBLE_LOCKED" },
    ],
    rework: [{ number: "515", floor: 5, status: "PICKUP", minutesInStatus: 20, reworkNote: "Minibar" }],
    outOfOrder: [{ number: "512", floor: 5, status: "OUT_OF_ORDER", minutesInStatus: 1440 }],
    longestWaitingForInspection: [{ number: "206", floor: 2, status: "CLEAN", minutesInStatus: 52 }],
    deferred: [{ number: "428", floor: 4, status: "DIRTY", minutesInStatus: 90, deferredMinutesAgo: 90 }],
  },
  arrivals: {
    expected: 5,
    readyNow: 3,
    vipPending: [{ room: "524", guest: "H.E. Al-Sayed", eta: "16:30" }],
    atRisk: [{ room: "205", guest: "Dr. Amelie Winter", eta: "14:40", status: "CLEAN" }],
  },
  engineering: {
    openWorkOrders: 2,
    unacknowledged: 1,
    resolvedInWindow: 3,
    open: [
      { room: "512", category: "PLUMBING", note: "Shower drain blocked", status: "ACK" },
      { room: "118", category: "IT_TV", note: "No signal", status: "OPEN" },
    ],
  },
  activity: {
    statusChanges: 214,
    roomsReleasedInWindow: 96,
    deniedAttempts: 2,
    byAttendant: [
      { name: "Maria Silva", rooms: 14 },
      { name: "Aylin Kaya", rooms: 11 },
    ],
  },
  notes: [{ room: "205", author: "Felix Ott", role: "front_office", body: "VIP amenity before arrival." }],
  ...over,
});

describe("handover facts", () => {
  it("never reports negative time in status", () => {
    const future = new Date(at.getTime() + 10 * 60_000);
    expect(minutesBetween(future, at)).toBe(0);
    expect(minutesBetween(new Date(at.getTime() - 90 * 60_000), at)).toBe(90);
  });

  it("turns the state of the house into flat, quotable lines", () => {
    const bullets = factsToBullets(facts());
    const joined = bullets.join(" ");
    expect(joined).toContain("96 of 143");
    expect(joined).toContain("302");
    // Machine values are humanised for prose: DOUBLE_LOCKED must not leak through.
    expect(joined).toContain("dnd");
    expect(joined).toContain("double locked");
    expect(joined).not.toContain("DOUBLE_LOCKED");
    expect(joined).toContain("Al-Sayed");
    expect(bullets.every((b) => b.trim().length > 0)).toBe(true);
  });

  it("leaves out sections that have nothing to report", () => {
    const quiet = facts({
      attention: { blocked: [], rework: [], outOfOrder: [], longestWaitingForInspection: [], deferred: [] },
      engineering: { openWorkOrders: 0, unacknowledged: 0, resolvedInWindow: 0, open: [] },
    });
    const joined = factsToBullets(quiet).join(" ");
    expect(joined).not.toMatch(/Blocked:/);
    expect(joined).not.toMatch(/open work orders/);
    expect(joined).not.toMatch(/Pushed to the next day/);
  });

  it("calls out rooms carried over from a previous plan by name", () => {
    const joined = factsToBullets(facts()).join(" ");
    expect(joined).toMatch(/Pushed to the next day for capacity/);
    expect(joined).toContain("428");
  });
});

describe("handover writer — it may not invent anything", () => {
  /** Every number in the prose must trace back to the facts. */
  it("uses no figure that is not in the facts", () => {
    const f = facts();
    const out = localWriter(f);
    const allowed = new Set<string>();
    const permit = (v: unknown) => allowed.add(String(v));

    Object.values(f.progress).forEach(permit);
    f.attention.blocked.forEach((r) => {
      permit(r.number);
      permit(r.minutesInStatus);
    });
    f.attention.rework.forEach((r) => permit(r.number));
    f.attention.outOfOrder.forEach((r) => permit(r.number));
    f.attention.deferred.forEach((r) => {
      permit(r.number);
      permit(r.deferredMinutesAgo);
    });
    permit(f.attention.blocked.length);
    permit(f.attention.rework.length);
    permit(f.attention.outOfOrder.length);
    permit(f.attention.deferred.length);
    permit(f.arrivals.expected);
    permit(f.arrivals.readyNow);
    f.arrivals.vipPending.forEach((v) => permit(v.room));
    f.arrivals.atRisk.forEach((a) => {
      permit(a.room);
      a.eta?.split(":").forEach(permit);
    });
    permit(f.engineering.openWorkOrders);
    permit(f.engineering.unacknowledged);
    f.engineering.open.forEach((w) => permit(w.room));
    Object.values(f.activity).forEach((v) => typeof v === "number" && permit(v));
    f.activity.byAttendant.forEach((a) => permit(a.rooms));
    permit(f.windowHours);
    f.notes.forEach((n) => permit(n.room));
    // Times printed from generatedAt.
    permit(at.getHours());
    permit(at.getMinutes());
    for (const part of at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).split(/\D+/)) permit(part);

    const numbersInText = `${out.headline} ${out.body}`.match(/\d+/g) ?? [];
    const invented = numbersInText.filter((n) => !allowed.has(n));
    expect(invented).toEqual([]);
  });

  it("leads with what needs a decision", () => {
    const out = localWriter(facts());
    expect(out.headline).toMatch(/at risk/i);
    expect(out.body).toMatch(/Needs a decision/);
  });

  it("says so plainly when nothing is outstanding", () => {
    const out = localWriter(
      facts({
        attention: { blocked: [], rework: [], outOfOrder: [], longestWaitingForInspection: [], deferred: [] },
        arrivals: { expected: 0, readyNow: 0, vipPending: [], atRisk: [] },
      })
    );
    expect(out.body).toMatch(/Nothing is blocked/);
  });

  it("is honest about not being a language model", () => {
    const out = localWriter(facts());
    expect(out.provider).toBe("local");
    expect(out.providerLabel).toMatch(/no language model/i);
  });

  it("is deterministic — the same board gives the same handover", () => {
    expect(localWriter(facts()).body).toBe(localWriter(facts()).body);
  });

  it("mentions refused status changes so they are not lost", () => {
    expect(localWriter(facts()).body).toMatch(/refused/i);
  });

  it("calls out rooms carried over from a plan by name, not lumped in with plain dirty rooms", () => {
    const out = localWriter(facts());
    expect(out.body).toMatch(/Carried over from today's plan/);
    expect(out.body).toContain("428");
  });

  it("leads with the carried-over count when nothing is at risk", () => {
    const out = localWriter(facts({ arrivals: { expected: 0, readyNow: 0, vipPending: [], atRisk: [] } }));
    expect(out.headline).toMatch(/carried over/i);
  });
});
