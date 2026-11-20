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
  // F9 (N3): nur Supervisoren und Hausmänner — Housekeeper werden hier nicht mehr eingeteilt
  people: [
    { id: "s1", name: "Petra Test", role: "SUP", badge: { letter: "P", tone: 1, name: "Petra Test" } },
    { id: "s2", name: "Sara Test", role: "SUP", badge: { letter: "S", tone: 2, name: "Sara Test" } },
    { id: "m1", name: "Hans Test", role: "HM" },
  ],
  loads: [1, 2, 3, 4, 5].map((floor) => ({ floor, rooms: floor === 5 ? 0 : 12, credits: 9, departures: 4, stayovers: 8, demanding: floor === 4 ? 6 : 0 })),
  assign: { s1: [1, 2, 3, 4] },
  suggestions: [{ userId: "m1", floor: 2, reason: { floor: 2, days: 4, of: 5, lastSeen: "2026-11-01" } }],
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
  it("F9 (N3): Personal-Leiste nur mit Supervisoren und Hausmännern, Hinweis auf die Präferenz-Etagen", () => {
    expect(out).toContain("Heute anwesend");
    for (const r of ["Supervisor", "Hausmann"]) expect(out).toContain(r);
    expect(out).not.toContain("Stufe");
    expect(out).toContain("Präferenz-Etagen (Einstellungen)");
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
  it("Warnung mit Symbol bei Etage ohne Supervisor; keine Housekeeper-Warnungen und keine Zi./HK-Kennzahl mehr", () => {
    expect(out).toContain("⚠");
    expect(out).not.toContain("noch keinen Housekeeper");
    expect(out).not.toMatch(/Zi\.\/HK/);
  });
  it("angetippte Person: Etagen werden zu Buttons zum Zuteilen", () => {
    const o = html(h(FloorTeamStep, props({ active: "m1" })));
    expect(o).toContain("Hans Test gewählt: jetzt Etage(n) antippen.");
    expect(o).toContain('aria-label="Hans Test auf Etage 3 einteilen"');
  });
  it("Tap-Flächen ≥ 48 px (Glas-Design) und nur die Personal-Leiste scrollt waagrecht", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/planung/FloorTeamStep.tsx"), "utf8");
    const buttons = src.match(/<button[\s\S]*?className=\{?[`"][^`"]*/g) ?? [];
    for (const b of buttons) expect(b, b.slice(0, 80)).toMatch(/min-h-12|min-h-14/);
    expect(src.match(/overflow-x-auto/g)).toHaveLength(1);
  });
});
