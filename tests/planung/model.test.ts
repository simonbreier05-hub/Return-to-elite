import { describe, expect, it } from "vitest";
import {
  canGoTo, dateLabel, fileStatus, floorStats, FLOOR_ORDER, houseTotals, listsReady, orderedFloors, stepState, waveDelay,
  type HouseFloor, type HouseTile, type TileKind,
} from "@/lib/planung/model";

const tiles = (n: number, kind: TileKind = "EMPTY", start = 100): HouseTile[] => Array.from({ length: n }, (_, i) => ({ number: String(start + i), kind }));
const mix = (): HouseFloor => ({
  floor: 2,
  tiles: [...tiles(3, "DEPARTURE", 200), ...tiles(2, "TURN", 210), ...tiles(5, "STAYOVER", 220), ...tiles(2, "ARRIVAL", 230), ...tiles(1, "EMPTY", 240)],
});

describe("Etagenbalken (Berechnung)", () => {
  it("belegt = Abreise + Same-Day-Turn + Bleiber; Anreise-Zimmer zählen nicht als belegt", () => {
    const s = floorStats(mix());
    expect(s).toMatchObject({ total: 13, occupied: 10, departures: 5, turns: 2, stayovers: 5, arrivals: 4 });
    expect(s.ratio).toBeCloseTo(10 / 13);
  });
  it("Text-Grundlage 'N von M belegt': Etage ohne Daten → Anteil 0", () => {
    expect(floorStats({ floor: 1, tiles: tiles(29) }).ratio).toBe(0);
    expect(floorStats({ floor: 1, tiles: [] }).ratio).toBe(0);
  });
  it("Etage 5 hat weniger Zimmer (kein 501–512): die Zeile zeigt nur vorhandene Zimmer", () => {
    const f5: HouseFloor = { floor: 5, tiles: tiles(17, "STAYOVER", 513) };
    const s = floorStats(f5);
    expect(s.total).toBe(17);
    expect(f5.tiles.some((t) => Number(t.number) <= 512)).toBe(false);
    expect(s.ratio).toBe(1);
  });
  it("Haus-Summen: belegt, Abreisen (inkl. Turns), Anreisen (inkl. Turns)", () => {
    const t = houseTotals([mix(), { floor: 3, tiles: [...tiles(4, "DEPARTURE", 300), ...tiles(1, "TURN", 310)] }]);
    expect(t).toEqual({ occupied: 15, departures: 10, arrivals: 5, total: 18 });
  });
  it("Etagen in Anzeigereihenfolge 5 → 1, fehlende werden leer ergänzt", () => {
    const o = orderedFloors([{ floor: 2, tiles: tiles(3) }]);
    expect(o.map((f) => f.floor)).toEqual([...FLOOR_ORDER]);
    expect(o.find((f) => f.floor === 4)!.tiles).toEqual([]);
  });
  it("Kachel-Welle läuft von oben nach unten, innerhalb der Zeile von links nach rechts", () => {
    expect(waveDelay(1, 0)).toBeGreaterThan(waveDelay(0, 5));
    expect(waveDelay(0, 3)).toBeGreaterThan(waveDelay(0, 2));
  });
});

describe("Stepper-Zustände", () => {
  it("erledigt / aktuell / folgt", () => {
    expect([1, 2, 3, 4].map((s) => stepState(s as 1, 2))).toEqual(["done", "current", "upcoming", "upcoming"]);
  });
  it("zurückspringen nur bis zum erreichten Schritt, nie darüber hinaus", () => {
    expect(canGoTo(1, 3, 3)).toBe(true);
    expect(canGoTo(3, 3, 3)).toBe(true);
    expect(canGoTo(4, 3, 3)).toBe(false);
    expect(canGoTo(4, 2, 4)).toBe(true);
  });
});

describe("Dateistatus", () => {
  const s = (phase: Parameters<typeof fileStatus>[0]["phase"], severities: Parameters<typeof fileStatus>[0]["severities"] = []) => fileStatus({ phase, severities });
  it("wartet → liest → gelesen / Warnung / Fehler → übernommen", () => {
    expect(s(null)).toBe("waiting");
    expect(s("discarded")).toBe("waiting");
    expect(s("waiting")).toBe("waiting");
    expect(s("reading")).toBe("reading");
    expect(s("read")).toBe("read");
    expect(s("read", ["INFO"])).toBe("read");
    expect(s("read", ["INFO", "WARNING"])).toBe("warning");
    expect(s("read", ["WARNING", "CRITICAL"])).toBe("error");
    expect(s("error")).toBe("error");
    expect(s("applied")).toBe("applied");
  });
  it("Weiter geht nur mit übernommenen Departures", () => {
    expect(listsReady({})).toBe(false);
    expect(listsReady({ FORECAST: true, ARRIVALS: true })).toBe(false);
    expect(listsReady({ DEPARTURES: true })).toBe(true);
  });
});

describe("Datumsanzeige", () => {
  it("Kalendertag unabhängig von der Zeitzone", () => {
    expect(dateLabel("2026-09-22")).toBe("DIENSTAG, 22.09.2026");
    expect(dateLabel("2026-10-06")).toBe("DIENSTAG, 06.10.2026");
  });
});
