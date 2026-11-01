import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as stats from "@/lib/workdata/stats";
import { catStats, defaultMinutes, extractSamples, personStats, planningMinutes, type Sample, type StatusEvt } from "@/lib/workdata/stats";
import { personEstimate } from "@/lib/planung/floorTeam";
import { proposePlan } from "@/lib/autoplan/propose";
import { hk, makeDay, makeInput } from "../autoplan/scenario";

const T0 = Date.UTC(2026, 10, 2, 7, 0);
const ev = (roomId: string, toStatus: string, min: number, userId: string | null = "a", day = "2026-11-02"): StatusEvt => ({ roomId, toStatus, at: T0 + min * 60_000, userId, day });

describe("Messung: Gestartet → Fertig", () => {
  it("normale Reinigung zählt", () => {
    expect(extractSamples([ev("r1", "IN_PROGRESS", 0), ev("r1", "CLEAN", 25)])).toEqual([expect.objectContaining({ hkId: "a", roomId: "r1", minutes: 25 })]);
  });
  it("DND/Blockierung dazwischen → nicht gezählt", () => {
    expect(extractSamples([ev("r1", "IN_PROGRESS", 0), ev("r1", "BLOCKED", 5), ev("r1", "IN_PROGRESS", 40), ev("r1", "CLEAN", 60)]))
      .toEqual([expect.objectContaining({ minutes: 20 })]); // nur der zweite, ungestörte Durchgang
  });
  it("unplausibel: unter 3 Minuten, über 3 Stunden, über Nacht, andere Person → ignoriert", () => {
    expect(extractSamples([ev("r1", "IN_PROGRESS", 0), ev("r1", "CLEAN", 2)])).toEqual([]);
    expect(extractSamples([ev("r2", "IN_PROGRESS", 0), ev("r2", "CLEAN", 200)])).toEqual([]);
    expect(extractSamples([ev("r3", "IN_PROGRESS", 0), ev("r3", "CLEAN", 30, "a", "2026-11-03")])).toEqual([]);
    expect(extractSamples([ev("r4", "IN_PROGRESS", 0, "a"), ev("r4", "CLEAN", 30, "b")])).toEqual([]);
  });
});

describe("Auswertung je Reinigungsart", () => {
  const s = (day: string, minutes: number, roomId = "r"): Sample => ({ hkId: "a", roomId, day, minutes, start: Date.parse(`${day}T08:00:00Z`), end: Date.parse(`${day}T08:00:00Z`) + minutes * 60_000 });
  it("Mindestanzahl Messwerte, sonst „zu wenig Daten\"", () => {
    expect(catStats([20, 22, 24, 26], 5).enough).toBe(false);
    expect(catStats([20, 22, 24, 26, 28], 5)).toEqual({ n: 5, mean: 24, median: 24, enough: true });
  });
  it("Planung nutzt eigenen Median → Hauswert → Standard aus Credits", () => {
    const own = personStats("a", [20, 21, 22, 23, 24].map((m, i) => s(`2026-10-2${i}`, m)), () => ["DEPARTURE"], 5);
    const def = defaultMinutes(25, 0.5, 1);
    const m = planningMinutes(own, { STAYOVER: 14 }, def);
    expect(m.DEPARTURE).toBe(22);
    expect(m.STAYOVER).toBe(14);
    expect(m.LAUNDRY).toBe(25);
  });
  it("Zimmer pro Tag und Tempo-Trend (letzte 7 gegenüber 7 davor)", () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(10 + i).padStart(2, "0")}`);
    const samples = days.map((d, i) => s(d, i < 7 ? 30 : 24));
    const p = personStats("a", samples, () => ["STAYOVER"], 5);
    expect(p.roomsPerDay).toBe(1);
    expect(p.trendPct).toBe(-20);
  });
  it("kein Ranking: das Modul bietet keine Vergleichs-/Sortierfunktion über Personen", () => {
    expect(Object.keys(stats).filter((k) => /rank|compare|best|leader/i.test(k))).toEqual([]);
  });
});

describe("Nutzung in der Planung", () => {
  it("geschätzte Dauer aus der Etagenzuweisung", () => {
    const people = [{ id: "a", role: "HK" as const, roomsLo: 10, roomsHi: 11, level: 2 }];
    const loads = [{ floor: 1, rooms: 10, credits: 7, departures: 4, stayovers: 6, demanding: 0 }];
    expect(personEstimate("a", people, { a: [1] }, loads, { DEPARTURE: 30, STAYOVER: 15 })).toBe(210);
  });
  it("Warnung, wenn jemand voraussichtlich nicht vor Schichtende fertig wird (kein Blockieren)", () => {
    const input = { ...makeInput(makeDay(20), [hk("a", "VOLLZEIT", 2, { roomsLo: 20, roomsHi: 20, minutesByKind: { TURN: 40, DEPARTURE: 40, STAYOVER: 30, LAUNDRY: 35, SUITE: 50 } })]), shiftMinutes: 450 };
    const r = proposePlan(input, { timeLimitMs: 300 });
    expect(r.metrics[0].expectedMinutes).toBeGreaterThan(450);
    expect(r.warnings.find((w) => w.code === "OVER_SHIFT")?.message).toMatch(/nicht vor Schichtende/);
    expect(r.unassigned).toEqual([]);
  });
});

describe("Sichtbarkeit (Mitarbeiterdaten)", () => {
  it("Team-Ansicht nur Supervisor/Duty Manager, eigene Werte nur für die eigene Person", () => {
    expect(readFileSync("src/app/api/workdata/route.ts", "utf8")).toMatch(/requireRole\(\["supervisor"\]\)/);
    const me = readFileSync("src/app/api/workdata/me/route.ts", "utf8");
    expect(me).toMatch(/requireRole\(\["room_attendant"\]\)/);
    expect(me).toMatch(/statsFor\(set, auth\.session\.userId\)/);
    expect(me).not.toMatch(/searchParams/);
  });
});
