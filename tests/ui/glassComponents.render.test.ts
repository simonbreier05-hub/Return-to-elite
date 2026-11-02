import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActionTile,
  Banner,
  Button,
  Field,
  FilterChip,
  FloorTile,
  KpiTile,
  MarkerBadge,
  NavItem,
  ProgressBar,
  RoomRow,
  RoomRowCompact,
  StatusChip,
  StatusIcon,
  TabItem,
} from "@/components/ui";

const r = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);

describe("Bausteine (src/components/ui)", () => {
  it("Button: primary Champagner ohne Glow, disabled gesperrt, Symbol links", () => {
    const html = r(h(Button, { icon: "check", disabled: true }, "Reinigung starten"));
    expect(html).toContain("bg-champagne");
    expect(html).toContain("disabled");
    expect(html).toContain("disabled:opacity-40");
    expect(html).not.toMatch(/shadow-marker|drop-shadow/);
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("Reinigung starten"));
    expect(r(h(Button, { variant: "secondary" }, "x"))).toContain("glass");
  });
  it("Status nie nur Farbe: StatusChip mit Text, StatusIcon und MarkerBadge mit aria-label", () => {
    expect(r(h(StatusChip, { status: "dnd", label: "DND" }))).toMatch(/<svg[\s\S]*DND/);
    expect(r(h(StatusIcon, { status: "done", label: "Erledigt" }))).toMatch(/role="img" aria-label="Erledigt"/);
    expect(r(h(MarkerBadge, { marker: "vip", label: "VIP" }))).toMatch(/aria-label="VIP"/);
  });
  it("FilterChip und ActionTile melden ihren Zustand (aria-pressed), Tippfläche ≥ 48", () => {
    const f = r(h(FilterChip, { active: true }, "Alle (8)"));
    expect(f).toContain('aria-pressed="true"');
    expect(f).toContain("min-h-(--size-touch-min)");
    expect(r(h(ActionTile, { icon: "moon", title: "Bitte nicht stören" }))).toContain('aria-pressed="false"');
  });
  it("RoomRow: ausgewählt = Glas + Auswahlmarkierung, höchstens 2 Marker, Button mit Fokusring", () => {
    const html = r(
      h(RoomRow, {
        room: "305",
        guest: "Herr Carter",
        lang: "EN",
        status: { value: "open", label: "Offen" },
        markers: [
          { kind: "priority", label: "Priorität" },
          { kind: "vip", label: "VIP" },
          { kind: "dnd", label: "DND" },
        ],
        state: "selected",
        onClick: () => {},
      }),
    );
    expect(html).toContain("glass-selected");
    expect(html).toContain("selection-marker");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("focus-visible:outline-accent-default");
    expect((html.match(/role="img"/g) ?? []).length).toBe(2);
    expect(html).toContain("min-h-(--size-row-height)");
  });
  it("RoomRow done = gedimmt mit Trennlinie, Compact zeigt Status als Symbol", () => {
    expect(r(h(RoomRow, { room: "310", status: { value: "done", label: "Erledigt" }, state: "done" }))).toMatch(/opacity-65[\s\S]*bg-surface-progress-track/);
    expect(r(h(RoomRowCompact, { room: "305", status: { value: "open", label: "Offen" } }))).toContain('aria-label="Offen"');
  });
  it("ProgressBar begrenzt den Wert und ist vorlesbar", () => {
    const html = r(h(ProgressBar, { value: 12, max: 8, label: "8 von 8" }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="8"');
    expect(html).toContain("width:100%");
  });
  it("FloorTile: Zustand + Zuteilung offen im Vorlesetext und als Goldrahmen", () => {
    const html = r(h(FloorTile, { room: "307", state: "departure", stateLabel: "Abreise", unassigned: true, unassignedLabel: "Zuteilung offen", onClick: () => {} }));
    expect(html).toContain('aria-label="307, Abreise, Zuteilung offen"');
    expect(html).toContain("border-accent-default");
  });
  it("NavItem/TabItem: aktiv = aria-current=page, Rail nur Symbol mit Vorlesetext", () => {
    expect(r(h(NavItem, { icon: "home", label: "Übersicht", active: true, href: "/attendant" }))).toContain('aria-current="page"');
    const rail = r(h(NavItem, { icon: "message", label: "Nachrichten", mode: "rail", count: 2, onClick: () => {} }));
    expect(rail).toContain('aria-label="Nachrichten (2)"');
    expect(rail).not.toContain(">Nachrichten<");
    expect(r(h(TabItem, { icon: "home", label: "Übersicht", count: 3, onClick: () => {} }))).toContain(">3<");
  });
  it("KpiTile attention = warmer Lichtreflex; Banner mit Symbol", () => {
    expect(r(h(KpiTile, { icon: "bed-single", label: "Meine Zimmer", value: 8, tone: "attention" }))).toContain("glass-warm");
    expect(r(h(Banner, { tone: "warning", title: "Hinweis" }))).toMatch(/role="note"[\s\S]*<svg/);
  });
  it("Field: Label gehört zum Feld, Fehler mit Symbol und aria-invalid", () => {
    const html = r(h(Field, { label: "Zimmernummer", id: "z", error: "Gibt es nicht" }));
    expect(html).toContain('for="z"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="z-error"');
    expect(html).toMatch(/z-error[\s\S]*<svg/);
  });
});
