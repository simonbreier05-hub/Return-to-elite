import { describe, expect, it } from "vitest";
import { readReceiptWithNames } from "@/lib/chat/readReceipt";

/** F5-Nachtrag (M16, B10): Lesebestätigung mit Namen — Absender zählt nicht, doppelte Leser nur einmal. */
describe("Lesebestätigung mit Namen", () => {
  const at = new Date("2026-11-19T08:00:00Z");
  const reads = new Map([["b", new Date("2026-11-19T08:05:00Z")], ["c", new Date("2026-11-19T07:00:00Z")]]);
  it("gelesen / noch nicht, sortiert, ohne Absender", () => {
    const r = readReceiptWithNames(at, "a", [{ id: "a", name: "Anna" }, { id: "c", name: "Cem" }, { id: "b", name: "Berta" }, { id: "b", name: "Berta" }, { id: "d", name: "Dana" }], reads);
    expect(r).toEqual({ read: 1, total: 3, readNames: ["Berta"], unreadNames: ["Cem", "Dana"] });
  });
});

import { bodyDe, bulletsDe, headlineDe } from "@/lib/handover/germanWriter";
import type { HandoverFacts } from "@/lib/handover/collectFacts";

describe("Übergabe auf Deutsch (fester Schreiber)", () => {
  const f = {
    generatedAt: new Date("2026-11-19T15:00:00Z"), windowHours: 8,
    progress: { totalRooms: 10, released: 6, sellable: 9, percentReleased: 67, stillDirty: 2, inProgress: 1, waitingForInspection: 0 },
    attention: { blocked: [{ number: "101", floor: 1, status: "BLOCKED", minutesInStatus: 30, blockReason: "DND", reworkNote: null, assignedTo: null }], rework: [], outOfOrder: [], longestWaitingForInspection: [], deferred: [] },
    arrivals: { expected: 3, readyNow: 2, vipPending: [], atRisk: [] },
    engineering: { openWorkOrders: 1, unacknowledged: 1, resolvedInWindow: 0, open: [{ room: "204", category: "PLUMBING", note: "", status: "OPEN" }] },
    activity: { statusChanges: 0, roomsReleasedInWindow: 0, deniedAttempts: 0, byAttendant: [] },
    notes: [],
  } as unknown as HandoverFacts;
  it("gleiche Zahlen, deutsche Sätze, keine englischen Reste", () => {
    expect(headlineDe(f)).toBe("67 % freigegeben, 3 Zimmer noch offen");
    const text = `${bodyDe(f)}\n${bulletsDe(f).join("\n")}`;
    expect(text).toContain("6 von 9 verkaufbaren Zimmern");
    expect(text).toContain("101, Bitte nicht stören seit 30 Min");
    expect(text).toContain("204 Sanitär (offen)");
    expect(text).not.toMatch(/\b(released|rooms|blocked|waiting)\b/);
  });
});
