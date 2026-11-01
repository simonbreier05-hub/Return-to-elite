import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FloorTeamStep, { type FloorTeamProps } from "@/components/planung/FloorTeamStep";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { floorKpi, floorWarnings, type Person } from "@/lib/planung/floorTeam";
import type { FloorTeamState } from "@/lib/planung/floorTeamData";

const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));
const state: FloorTeamState = {
  date: "2026-11-02",
  people: [
    { id: "s1", name: "Petra Test", role: "SUP", badge: { letter: "P", tone: 1, name: "Petra Test" } },
    { id: "h1", name: "Anna Test", role: "HK", level: 3, kind: "VOLLZEIT", roomsLo: 13, roomsHi: 13 },
    { id: "h2", name: "Berta Test", role: "HK", level: 1, kind: "AZUBI", roomsLo: 6, roomsHi: 8 },
    { id: "m1", name: "Hans Test", role: "HM" },
  ],
  loads: [1, 2, 3, 4, 5].map((floor) => ({ floor, rooms: floor === 5 ? 0 : 12, credits: 9, departures: 4, stayovers: 8, demanding: floor === 4 ? 6 : 0 })),
  assign: { s1: [1, 2, 3, 4, 5], h2: [4] },
  suggestions: [{ userId: "h1", floor: 2, reason: { floor: 2, days: 4, of: 5, lastSeen: "2026-11-01" } }],
  rules: { window: 5, minDays: 3, demandingShare: 0.3, maxFloors: 2 },
};
const persons: Person[] = state.people.map((p) => ({ id: p.id, role: p.role, roomsLo: p.roomsLo ?? 0, roomsHi: p.roomsHi ?? 0, level: p.level ?? 0 }));
const props = (over: Partial<FloorTeamProps> = {}): FloorTeamProps => ({
  state, loading: false, assign: state.assign, active: null, open: state.suggestions,
  kpis: Object.fromEntries(state.loads.map((l) => [l.floor, floorKpi(l, persons, state.assign)])),
  warnings: floorWarnings(state.loads, persons, state.assign, 0.3),
  onTapPerson: () => {}, onTapFloor: () => {}, onRemove: () => {}, onDrop: () => {}, onAcceptAll: () => {}, onAccept: () => {}, onDismiss: () => {}, onDone: () => {},
  ...over,
});

describe("Schritt 3 „Etagenzuweisung\" für das ganze Team", () => {
  const out = html(h(FloorTeamStep, props()));
  it("Personal-Leiste gruppiert nach Rolle, mit Stufe bei Housekeepern", () => {
    expect(out).toContain("Heute anwesend");
    for (const r of ["Supervisor", "Housekeeper", "Hausmann"]) expect(out).toContain(r);
    expect(out).toContain("Anna Test · Stufe 3");
  });
  it("Etagen 5 → 1 mit Zimmern, Credits, Abreisen/Bleibern", () => {
    expect(out.indexOf(">Etage 5 · ")).toBeGreaterThan(-1);
    expect(out.indexOf(">Etage 5 · ")).toBeLessThan(out.indexOf(">Etage 1 · "));
    expect(out).toContain("12 Zimmer · 9 Credits");
    expect(out).toContain("4 Abreisen · 8 Bleiber");
  });
  it("Vorschlag als Messing-Chip mit Grund, „Alle Vorschläge übernehmen\"", () => {
    expect(out).toContain("Alle Vorschläge übernehmen");
    expect(out).toContain("zuletzt an 4 von 5 Tagen auf Etage 2");
    expect(out).toMatch(/border-dashed border-brass-light/);
  });
  it("Warnungen mit Symbol: Stufe 1 auf anspruchsvoller Etage, Etage ohne Housekeeper", () => {
    expect(out).toContain("Berta Test (Stufe 1) auf Etage 4");
    expect(out).toContain("Etage 1 hat noch keinen Housekeeper.");
    expect(out).toContain("⚠");
  });
  it("Kennzahl mit Ampel-Symbol zusätzlich zur Farbe", () => {
    expect(out).toMatch(/12 Zi\.\/HK · Ziel 6–8/); // Etage 4: Berta allein
    expect(out).toContain("▲");
  });
  it("angetippte Person: Etagen werden zu Buttons zum Zuteilen", () => {
    const o = html(h(FloorTeamStep, props({ active: "h1" })));
    expect(o).toContain("Anna Test gewählt: jetzt Etage(n) antippen.");
    expect(o).toContain('aria-label="Anna Test auf Etage 3 einteilen"');
  });
  it("Tap-Flächen ≥ 44 px und nur die Personal-Leiste scrollt waagrecht", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/planung/FloorTeamStep.tsx"), "utf8");
    const buttons = src.match(/<button[\s\S]*?className=\{?[`"][^`"]*/g) ?? [];
    for (const b of buttons) expect(b, b.slice(0, 80)).toMatch(/min-h-11|min-h-14/);
    expect(src.match(/overflow-x-auto/g)).toHaveLength(1);
  });
});
