import { describe, expect, it } from "vitest";
import {
  applySuggestions, floorDiff, floorKpi, floorWarnings, resolveSuggestions, roomBand, suggestFromHistory,
  type FloorLoad, type Person, type WorkDay,
} from "@/lib/planung/floorTeam";
import { DEFAULT_SETTINGS } from "@/lib/domain";

const RULES = { window: 5, minDays: 3 };
const day = (date: string, ...floors: number[]): WorkDay => ({ date, floors });
const hk = (id: string, level = 2, lo = 10, hi = 11): Person => ({ id, role: "HK", roomsLo: lo, roomsHi: hi, level });
const sup = (id: string): Person => ({ id, role: "SUP", roomsLo: 0, roomsHi: 0, level: 0 });
const load = (floor: number, rooms: number, demanding = 0): FloorLoad => ({ floor, rooms, credits: rooms * 0.8, departures: 0, stayovers: rooms, demanding });

describe("Historien-Regel (3 von 5 Einsatztagen)", () => {
  it("Etage an 3 von 5 Tagen → Vorschlag mit Grund", () => {
    const r = suggestFromHistory([day("2026-10-27", 2), day("2026-10-28", 3), day("2026-10-29", 2), day("2026-10-30", 2), day("2026-10-31", 4)], RULES);
    expect(r).toEqual([{ floor: 2, days: 3, of: 5, lastSeen: "2026-10-30" }]);
  });
  it("nur 2 von 5 → kein Vorschlag", () => {
    expect(suggestFromHistory([day("2026-10-27", 2), day("2026-10-28", 3), day("2026-10-29", 2), day("2026-10-30", 4), day("2026-10-31", 5)], RULES)).toEqual([]);
  });
  it("nur die letzten 5 Einsatztage zählen; freie Tage fehlen einfach (Urlaub zählt nicht)", () => {
    const old = [day("2026-10-01", 1), day("2026-10-02", 1), day("2026-10-03", 1)];
    const recent = [day("2026-10-20", 3), day("2026-10-24", 3), day("2026-10-29", 3), day("2026-10-30", 2), day("2026-10-31", 2)];
    expect(suggestFromHistory([...old, ...recent], RULES).map((x) => x.floor)).toEqual([3]);
  });
  it("höchstens 2 Etagen", () => {
    const d = ["27", "28", "29", "30", "31"].map((x) => day(`2026-10-${x}`, 1, 2, 3));
    expect(suggestFromHistory(d, RULES)).toHaveLength(2);
  });
  it("neue Person ohne Historie → kein Vorschlag, kein Fehler", () => {
    expect(suggestFromHistory([], RULES)).toEqual([]);
    expect(resolveSuggestions([hk("neu")], {}, [load(1, 20)], {}, RULES)).toEqual([]);
  });
});

describe("Konfliktauflösung", () => {
  const five = (floor: number, n: number, end = 31) => Array.from({ length: 5 }, (_, i) => day(`2026-10-${String(end - i).padStart(2, "0")}`, i < n ? floor : 9));
  it("Supervisor: einer je Etage, stärkste Historie gewinnt", () => {
    const s = resolveSuggestions([sup("a"), sup("b")], { a: five(2, 3), b: five(2, 5) }, [load(2, 20)], {}, RULES);
    expect(s.map((x) => x.userId)).toEqual(["b"]);
  });
  it("Housekeeper: nur so viele, bis die Zimmer der Etage gedeckt sind", () => {
    // Etage 1: 12 Zimmer, je Person Zielmitte 10,5 → zwei Kandidaten reichen, der dritte (schwächste) bleibt ohne Vorschlag
    const s = resolveSuggestions([hk("a"), hk("b"), hk("c")], { a: five(1, 5), b: five(1, 4), c: five(1, 3) }, [load(1, 12)], {}, RULES);
    expect(s.map((x) => x.userId).sort()).toEqual(["a", "b"]);
  });
  it("Gleichstand: jüngerer Einsatz gewinnt", () => {
    const s = resolveSuggestions([sup("a"), sup("b")], { a: five(2, 4, 30), b: five(2, 4, 31) }, [load(2, 20)], {}, RULES);
    expect(s.map((x) => x.userId)).toEqual(["b"]);
  });
});

describe("Vorrang manueller Zuteilung", () => {
  const hist = { a: ["27", "28", "29", "30", "31"].map((x) => day(`2026-10-${x}`, 2)) };
  it("wer schon zugeteilt ist, bekommt keinen Vorschlag", () => {
    expect(resolveSuggestions([hk("a")], hist, [load(2, 20), load(3, 20)], { a: [3] }, RULES)).toEqual([]);
  });
  it("manuelle Plätze zählen bei der Deckung mit", () => {
    const s = resolveSuggestions([hk("m"), hk("a")], hist, [load(2, 10)], { m: [2] }, RULES);
    expect(s).toEqual([]); // 10 Zimmer schon durch m gedeckt
  });
  it("„Alle übernehmen\" überspringt Personen, die heute von Hand geändert wurden", () => {
    const sugg = [{ userId: "a", floor: 2, reason: { floor: 2, days: 5, of: 5, lastSeen: "2026-10-31" } }, { userId: "b", floor: 1, reason: { floor: 1, days: 3, of: 5, lastSeen: "2026-10-31" } }];
    const out = applySuggestions({ a: [4] }, sugg, new Set(["a"]));
    expect(out).toEqual({ a: [4], b: [1] });
    expect(applySuggestions({}, sugg, new Set(["a"]), { userId: "a", floor: 2 })).toEqual({ a: [2] }); // Einzel-Tap übernimmt trotzdem
  });
});

describe("Warnungen (weich)", () => {
  it("Housekeeper auf mehr als 2 Etagen", () => {
    const w = floorWarnings([load(1, 5), load(2, 5), load(3, 5)], [hk("a"), sup("s")], { a: [1, 2, 3], s: [1, 2, 3] }, 0.3);
    expect(w.filter((x) => x.code === "HK_TOO_MANY_FLOORS")).toEqual([{ code: "HK_TOO_MANY_FLOORS", userId: "a" }]);
  });
  it("genau 2 Etagen → keine Warnung", () => {
    const w = floorWarnings([load(1, 5), load(2, 5)], [hk("a"), sup("s")], { a: [1, 2], s: [1, 2] }, 0.3);
    expect(w.some((x) => x.code === "HK_TOO_MANY_FLOORS")).toBe(false);
  });
  it("Stufe 1 auf anspruchsvoller Etage, Etage ohne Housekeeper/Supervisor", () => {
    const w = floorWarnings([load(4, 10, 4), load(5, 6)], [hk("a", 1, 6, 8), sup("s")], { a: [4], s: [4] }, 0.3);
    expect(w).toContainEqual({ code: "LEVEL1_DEMANDING", floor: 4, userId: "a" });
    expect(w).toContainEqual({ code: "FLOOR_NO_HK", floor: 5 });
    expect(w).toContainEqual({ code: "FLOOR_NO_SUP", floor: 5 });
  });
});

describe("Live-Kennzahl je Etage", () => {
  it("Zimmer je Housekeeper mit Ampel; 2 Etagen zählen je ½", () => {
    expect(floorKpi(load(1, 21), [hk("a"), hk("b")], { a: [1], b: [1] })).toMatchObject({ roomsPerHk: 10.5, tone: "ok", heads: 2 });
    expect(floorKpi(load(1, 30), [hk("a"), hk("b")], { a: [1], b: [1] }).tone).toBe("high");
    expect(floorKpi(load(1, 8), [hk("a"), hk("b")], { a: [1], b: [1] }).tone).toBe("low");
    expect(floorKpi(load(1, 6), [hk("a")], { a: [1, 2] })).toMatchObject({ roomsPerHk: 12, heads: 0.5 });
    expect(floorKpi(load(1, 6), [], {}).tone).toBe("none");
  });
});

describe("Zimmer-Zielband (Typ + Stufe)", () => {
  const s = DEFAULT_SETTINGS as unknown as Record<string, number>;
  it("Vollzeit 13 / 10–11 / 6–8, Teilzeit 9 / 7", () => {
    expect(roomBand("VOLLZEIT", 3, s)).toEqual({ lo: 13, hi: 13 });
    expect(roomBand("VOLLZEIT", 2, s)).toEqual({ lo: 10, hi: 11 });
    expect(roomBand("VOLLZEIT", 1, s)).toEqual({ lo: 6, hi: 8 });
    expect(roomBand("TEILZEIT", 3, s)).toEqual({ lo: 9, hi: 9 });
    expect(roomBand("TEILZEIT", 2, s)).toEqual({ lo: 7, hi: 7 });
    expect(roomBand("AZUBI", 3, s)).toEqual({ lo: 6, hi: 8 });
  });
});

describe("floorDiff (Audit vorher/nachher)", () => {
  it("nur geänderte Personen", () => {
    expect(floorDiff({ a: [1], b: [2] }, { a: [1], b: [3], c: [4] })).toEqual([
      { userId: "b", before: [2], after: [3] }, { userId: "c", before: [], after: [4] },
    ]);
  });
});
