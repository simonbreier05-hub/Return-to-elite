import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { CrewChip, DayHeader, FloorLane, TeamBar } from "@/components/tagesplan/TagesplanParts";
import { crewSummaries, emptyMix, floorLanes, type PlanRoom } from "@/lib/ui/tagesplan";

// Erfundene Testdaten.
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));
const room = (id: string, floor: number, kind: PlanRoom["kind"], to: string | null): PlanRoom => ({ id, number: id, floor, kind, credit: 1, assignedToId: to, open: !to });
const rooms = [room("101", 1, "turn", "a"), room("102", 1, "tidy", "a"), room("103", 1, "deep", null)];
const crew = crewSummaries([{ id: "a", name: "Testkraft A" }, { id: "b", name: "Testkraft B" }], rooms);

describe("Tagesplan-Bausteine", () => {
  it("Kraft-Chip: Status mit Symbol + Wort, ≥ 48 px, gedrückt-Zustand", () => {
    const out = html(h(CrewChip, { name: "Testkraft A", rooms: 11, credits: 9.5, state: "balanced", selected: true, onClick: () => {} }));
    expect(out).toContain("min-h-12");
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain("Ausgewogen");
    expect(out).toMatch(/<svg/);
  });
  it("Etagen-Zeile zugeklappt: Etage, Zähler nur > 0, „N offen“, aria-expanded", () => {
    const lane = floorLanes([1], rooms, crew)[0];
    const out = html(h(FloorLane, { lane, open: false, onToggle: () => {}, selectedId: null, onSelectCrew: () => {} }));
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain("1 Turn");
    expect(out).toContain("1 Deep");
    expect(out).not.toContain("0 Linen");
    expect(out).toContain("1 offen");
    expect(out).toContain("Testkraft A");
  });
  it("Team-Leiste: Fach „Verfügbar“ mit Kräften ohne Zimmer", () => {
    const out = html(h(TeamBar, { crew, selectedId: null, assigningId: null, available: [{ id: "b", name: "Testkraft B" }], onSelect: () => {} }));
    expect(out).toContain("Verfügbar (1)");
    expect(out).toContain("Testkraft B");
  });
  it("Tageskopf: Plan-Status mit Symbol + Text, Live/Freigabe-Chips, „bestätigen bis“", () => {
    const out = html(h(DayHeader, { dateText: "Montag, 9. November", state: "proposal", live: { done: 3, total: 40 }, release: 2, stats: [{ key: "x", icon: "star", label: "Σ Credits", value: "30,5" }] }));
    expect(out).toContain("Vorschlag");
    expect(out).toContain("bestätigen bis 08:00");
    expect(out).toContain("Live ▸ 3/40");
    expect(out).toContain("Freigabe ▸ 2");
    expect(emptyMix().turn).toBe(0);
  });
});

describe("Regeln für die Tagesplan-Dateien", () => {
  const dir = path.join(__dirname, "../../src/components/tagesplan");
  const files = ["TagesplanView.tsx", "TagesplanParts.tsx", "PlanningParts.tsx", "TagesplanWindow.tsx", "useTagesplanMeta.ts"].map((f) => [f, readFileSync(path.join(dir, f), "utf8")] as const);
  it("kein Blur, keine Dauer-Animation, keine physischen Richtungs-Klassen", () => {
    for (const [f, s] of files) {
      expect(s, f).not.toMatch(/backdrop-blur|backdrop-filter|animate-(spin|pulse|ping|bounce)/);
      expect(s, f).not.toMatch(/\b(ml|mr|pl|pr)-\d|\b(left|right)-\d|text-(left|right)\b/);
    }
  });
  it("keine Beschäftigtendaten-Felder, keine Gastnamen, kein Neuaufbau per key", () => {
    for (const [f, s] of files) {
      expect(s, f).not.toMatch(/\b(hkLevel|hkType|homeFloors|dailyTarget|guestName)\b/);
      expect(s, f).not.toMatch(/<TagesplanView[^>]*\bkey=/);
    }
  });
  it("Fenster per Portal am body", () => {
    expect(files.find(([f]) => f === "TagesplanWindow.tsx")![1]).toMatch(/createPortal\([\s\S]*document\.body/);
  });
});
