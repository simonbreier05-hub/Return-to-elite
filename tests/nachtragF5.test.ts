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
