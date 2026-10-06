import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FloorStep from "@/components/planung/FloorStep";
import PlanStep from "@/components/planung/PlanStep";
import ProgressRing from "@/components/planung/ProgressRing";
import StepSegments from "@/components/planung/StepSegments";
import TeamStep from "@/components/planung/TeamStep";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import type { HouseData } from "@/lib/planung/model";
import { capacityVerdict, phaseStates } from "@/lib/planung/team";
import type { TeamState } from "@/lib/planung/teamData";

const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));
const badge = (letter: string, tone: 1 | 2 | 3) => ({ letter, tone, name: letter });

const state: TeamState = {
  date: "2026-09-22", hasPlan: true, demand: { credits: 40, rooms: 30 },
  members: {
    hk: [{ id: "h1", name: "Anna Test", kind: "VOLLZEIT", level: 3, target: 14 }, { id: "h2", name: "Berta Test", kind: "AZUBI", level: 1, target: 8 }],
    sup: [{ id: "s1", name: "Petra Test", badge: badge("P", 2) }, { id: "s2", name: "Jonas Test", badge: badge("J", 1) }],
    hm: [{ id: "m1", name: "Hans Test" }],
  },
  selected: { hk: ["h1"], sup: ["s1"], hm: [] }, source: "default", floorAssign: { 1: null, 2: null, 3: null, 4: null, 5: null },
};
const team = (over: Partial<Parameters<typeof TeamStep>[0]> = {}) =>
  html(h(TeamStep, { state, sel: state.selected, onToggle: () => {}, verdict: capacityVerdict(40, [14]), missing: [], loading: false, previous: false, ...over }));

describe("Schritt Team", () => {
  it("Chips sind echte Buttons mit aria-pressed; gewählt = true", () => {
    const out = team();
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?Anna Test/);
    expect(out).toMatch(/<button[^>]*aria-pressed="false"[^>]*>[\s\S]*?Berta Test/);
  });
  it("Typ und Stufe stehen in der Chip-Zeile (der Server liefert sie nur an Supervisor/Duty Manager)", () => {
    const out = team();
    expect(out).toContain("Vollzeit · Stufe 3");
    expect(out).toContain("Azubi · Stufe 1");
  });
  it("Bedarf gegen Besetzung: Aussage steht im Text, nicht nur in der Farbe", () => {
    expect(team({ verdict: capacityVerdict(40, [14]) })).toContain("Zu knapp: 26 Credits fehlen");
    expect(team({ verdict: capacityVerdict(10, [14]) })).toContain("Besetzung reicht");
  });
  it("nennt, was für Weiter fehlt", () => {
    expect(team({ missing: ["HK"] })).toContain("Es fehlt mindestens ein Housekeeper.");
    expect(team({ missing: ["SUP"] })).toContain("Es fehlt mindestens ein Supervisor.");
    expect(team({ missing: ["HK", "SUP"] })).toContain("mindestens ein Housekeeper und ein Supervisor");
  });
  it("ohne Tagesplan: Hinweis statt Auswahl; Wischkarten sind Scroll-Snap-Karten", () => {
    expect(team({ state: { ...state, hasPlan: false } })).toContain("Noch kein Tagesplan");
    expect(team()).toContain("snap-x");
    expect(team()).toContain("snap-center");
  });
});

const house: HouseData = {
  date: "2026-09-22", hasData: true, supervisors: {},
  floors: [1, 2, 3, 4, 5].map((floor) => ({ floor, tiles: [{ number: `${floor}01`, kind: "STAYOVER" as const }, { number: `${floor}02`, kind: "EMPTY" as const }] })),
};
const floors = (assign: Record<number, string | null>) =>
  html(h(FloorStep, { house, sups: state.members.sup.map((s) => ({ id: s.id, name: s.name, badge: s.badge })), assign, onPick: () => {}, animateKey: 1 }));

describe("Schritt Etagen", () => {
  it("eine Zeile je Etage 5 → 1, mit Zimmerzahl und Belegung als Text", () => {
    const out = floors({});
    const order = [...out.matchAll(/Etage (\d) · /g)].map((m) => m[1]);
    expect(order.slice(0, 5)).toEqual(["5", "4", "3", "2", "1"]);
    expect(out).toContain("2 Zimmer");
    expect(out).toContain("1 von 2 belegt");
  });
  it("Auswahl per aria-pressed; nicht zugeteilte Etage ist als Text benannt", () => {
    const out = floors({ 5: "s2" });
    expect(out).toMatch(/aria-pressed="true"[^>]*>[\s\S]{0,260}Jonas Test/);
    expect(out).toContain("Nicht zugeteilt");
  });
  it("Mobil: Antippen wechselt den Supervisor (Button mit Beschriftung)", () => {
    expect(floors({ 3: "s1" })).toContain("Supervisor für Etage 3: Petra Test. Antippen zum Wechseln");
  });
  it("Badges tragen immer einen Buchstaben", () => {
    expect(floors({ 1: "s1" })).toMatch(/rounded-full[^>]*>P<\/span>/);
  });
});

describe("Schritt Plan", () => {
  const plan = (counts: { roomLists: number; supervisorLists: number; hausmannLists: number } | null, extra = {}) =>
    html(h(PlanStep, { states: phaseStates(counts ? 5 : 1, !counts, null), counts, warnings: [], error: null, started: true, ...extra }));
  it("Statuszeilen folgen dem Fortschritt", () => {
    const out = plan(null);
    expect(out).toContain('data-state="done"');
    expect(out).toContain('data-state="running"');
    expect(out).toContain('data-state="waiting"');
  });
  it("Ergebnis: drei Entwurfs-Karten, Singular/Plural, Hinweis Nichts ist live", () => {
    const out = plan({ roomLists: 8, supervisorLists: 1, hausmannLists: 2 }, { warnings: [{ severity: "WARNING", message: "Etagenregel verletzt" }] });
    expect(out).toContain("8 Zimmerlisten");
    expect(out).toContain("1 Supervisor-Liste");
    expect(out).toContain("2 Hausmann-Listen");
    expect(out.match(/Entwurf/g)!.length).toBeGreaterThanOrEqual(3);
    expect(out).toContain("Etagenregel verletzt");
    expect(out).toContain("Nichts ist live, bis du bestätigst.");
  });
  it("Fehler wird als Text gemeldet", () => {
    expect(plan(null, { error: "Keine anwesenden Housekeeper ausgewählt.", states: phaseStates(1, false, "propose") })).toContain("Der Plan konnte nicht erstellt werden.");
  });
});

describe("Mobil (Design C)", () => {
  it("Fortschrittssegmente: aktuelles Segment ist aria-current, Text je Schritt", () => {
    const out = html(h(StepSegments, { current: 2, labels: { 1: "Listen", 2: "Team", 3: "Etagen", 4: "Plan" }, dateText: "22.09.2026", stepText: "Schritt 2 von 4", ariaLabel: "Schritte" }));
    expect(out).toContain('aria-current="step"');
    expect(out).toContain("Listen ✓");
    expect(out).toContain("Schritt 2 von 4");
  });
  it("Ring ist ein Button (Antippen startet) und nennt den Stand auch als Zahl", () => {
    const out = html(h(ProgressRing, { done: 2, total: 4, pulse: true, label: "Fortschritt", hint: "Tippen zum Start", onClick: () => {} }));
    expect(out).toMatch(/<button[^>]*aria-label="Fortschritt: Tippen zum Start"/);
    expect(out).toContain("50%");
  });
});

describe("Rollenrechte und Bewegung", () => {
  const read = (rel: string) => readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
  it("Team- und Etagen-API sind auf Supervisor/Duty Manager beschränkt (Typ/Stufe sind Beschäftigtendaten)", () => {
    for (const r of ["src/app/api/planung/team/route.ts", "src/app/api/planung/floors/route.ts"]) {
      const src = read(r);
      expect((src.match(/requireRole\(\["supervisor"\]\)/g) ?? []).length).toBe((src.match(/export async function/g) ?? []).length);
    }
  });
  it("Plan-Fächer animiert nur transform/opacity und ist einmalig; Reduced-Motion schaltet sie ab", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@keyframes pl-fan \{ from \{ opacity: 0; transform: [^}]*\} \}/);
    expect(css).not.toMatch(/\.pl-fan[^}]*infinite/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.planung-root \*[\s\S]*animation: none !important/);
  });
  it("Tap-Flächen: Chips und Hauptbutton mindestens 44 px", () => {
    expect(read("src/components/planung/TeamStep.tsx")).toContain("min-h-11");
    expect(read("src/components/planung/PrimaryButton.tsx")).toContain("h-14");
    expect(read("src/components/planung/FloorStep.tsx")).toContain("min-h-14");
  });
});
