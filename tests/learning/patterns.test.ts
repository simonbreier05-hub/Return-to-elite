import { describe, expect, it } from "vitest";
import { deviationWeight, keysOf, learnPatterns, type DeviationLike } from "@/lib/learning/patterns";

const RULES = { window: 5, minDays: 3, expireDays: 10 };
const days = (n: number, end = 31) => Array.from({ length: n }, (_, i) => `2026-10-${String(end - i).padStart(2, "0")}`);
const floorDev = (date: string, person = "p1", from = 3, to = "2", weight = 1): DeviationLike => ({ date, kind: "FLOOR_CHANGED", personId: person, before: String(from), after: to, weight });
const roomDev = (date: string, room = "410", from = "hkA", to = "hkB", weight = 1): DeviationLike => ({ date, kind: "ROOM_MOVED", roomNumber: room, before: from, after: to, weight });

describe("Muster: 3 von 5 Planungstagen", () => {
  it("dieselbe Etagen-Korrektur an 3 von 5 Tagen → Muster", () => {
    const p = learnPatterns(days(3).map((d) => floorDev(d)), days(5), RULES);
    expect(p).toEqual([expect.objectContaining({ key: "FLOOR|p1|2", kind: "FLOOR", floor: 2, days: 3, of: 5, lastDate: "2026-10-31" })]);
  });
  it("nur 2 von 5 → kein Muster", () => {
    expect(learnPatterns(days(2).map((d) => floorDev(d)), days(5), RULES)).toEqual([]);
  });
  it("Zimmer verschoben: Ziel-Person und gestiegene Stufe als zwei Muster", () => {
    const level = (id: string) => ({ hkA: 2, hkB: 3 } as Record<string, number>)[id];
    const p = learnPatterns(days(4).map((d) => roomDev(d)), days(5), RULES, { levelOf: level });
    expect(p.map((x) => x.key).sort()).toEqual(["ROOML|410|3", "ROOMP|410|hkB"]);
    expect(p.find((x) => x.kind === "ROOM_LEVEL")?.minLevel).toBe(3);
  });
  it("Zurückstellen wird als eigenes Muster erkannt", () => {
    const p = learnPatterns(days(3).map((d) => ({ date: d, kind: "ROOM_DEFERRED", roomNumber: "205", before: "hkA", after: null, weight: 1 })), days(5), RULES);
    expect(p.map((x) => x.key)).toEqual(["DEFER|205"]);
  });
});

describe("Plausibilität, Auslaufen, Löschen", () => {
  it("Tage mit außergewöhnlicher Lage (Gewicht 0) zählen nicht", () => {
    const devs = [floorDev("2026-10-31"), floorDev("2026-10-30"), floorDev("2026-10-29", "p1", 3, "2", 0)];
    expect(learnPatterns(devs, days(5), RULES)).toEqual([]);
  });
  it("Gewicht 0 bei > 30 % weniger Personal als üblich", () => {
    expect(deviationWeight(6, [10, 10, 9, 10, 11])).toBe(0);
    expect(deviationWeight(8, [10, 10, 9, 10, 11])).toBe(1);
    expect(deviationWeight(5, [])).toBe(1);
  });
  it("10 Planungstage ohne Bestätigung → ausgelaufen", () => {
    const old = ["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => floorDev(d));
    const planning = [...days(10), "2026-10-01", "2026-10-02", "2026-10-03"];
    expect(learnPatterns(old, planning, { ...RULES, window: 20 })).toEqual([]);
  });
  it("gelöschtes Muster lernt nur aus neuen Beobachtungen", () => {
    const devs = days(3).map((d) => floorDev(d));
    expect(learnPatterns(devs, days(5), RULES, { deletedAt: { "FLOOR|p1|2": "2026-10-30" } })).toEqual([]);
  });
});

describe("Schlüssel", () => {
  it("Etage, die schon vorgeschlagen war, zählt nicht als Änderung", () => {
    expect(keysOf(floorDev("2026-10-31", "p1", 3, "3,4")).map((k) => k.key)).toEqual(["FLOOR|p1|4"]);
  });
});

describe("Rechte", () => {
  it("Gelernte Regeln ändern/löschen nur Duty Manager; ansehen auch Supervisor", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/api/learning/route.ts", "utf8");
    const fn = (name: string) => src.slice(src.indexOf(`export async function ${name}`), src.indexOf("}", src.indexOf(`export async function ${name}`) + 60) + 200);
    expect(fn("PATCH")).toMatch(/requireRole\(\["duty_manager"\]\)/);
    expect(fn("DELETE")).toMatch(/requireRole\(\["duty_manager"\]\)/);
    expect(fn("GET")).toMatch(/requireRole\(\["supervisor"\]\)/);
  });
});
