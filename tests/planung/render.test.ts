import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FileDropCard from "@/components/planung/FileDropCard";
import HouseMap from "@/components/planung/HouseMap";
import Stepper from "@/components/planung/Stepper";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import type { HouseData, HouseTile, TileKind } from "@/lib/planung/model";

const tile = (n: string, kind: TileKind): HouseTile => ({ number: n, kind });
const house = (hasData: boolean): HouseData => ({
  date: "2026-09-22", hasData,
  floors: [
    { floor: 1, tiles: [tile("101", hasData ? "DEPARTURE" : "EMPTY"), tile("102", hasData ? "STAYOVER" : "EMPTY"), tile("103", "EMPTY")] },
    { floor: 5, tiles: [tile("513", hasData ? "TURN" : "EMPTY")] },
  ],
  supervisors: { 1: { letter: "P", tone: 2, name: "Petra Test" } },
});
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));
const map = (hd: HouseData, extra = {}) => html(h(HouseMap, { house: hd, dateLabel: "DIENSTAG, 22.09.2026", ...extra }));

describe("Tastatur", () => {
  it("alle Kacheln zusammen haben nur einen Tab-Stopp", () => {
    const out = map(house(true));
    expect((out.match(/data-room="/g) ?? []).length).toBeGreaterThan(1);
    expect((out.match(/data-room="[^"]*"[^>]*tabindex="0"/g) ?? []).length).toBe(1);
  });
});

describe("Haus-Ansicht (Rendering)", () => {
  it("ohne Daten: 'noch keine Daten', gestrichelte Kreise, leere Kacheln, keine Animation", () => {
    const m = map(house(false));
    expect(m).toContain("noch keine Daten");
    expect(m).toContain("border-dashed");
    expect(m).not.toContain("pl-tile");
    expect(m).toContain("–");
  });
  it("mit Daten: Etagentext 'N von M belegt', Kacheln mit Zimmernummer und Art, Supervisor-Badge mit Buchstabe", () => {
    const m = map(house(true), { animateKey: 1 });
    expect(m).toContain("2 von 3 belegt");
    expect(m).toContain("1 von 1 belegt");
    expect(m).toContain('aria-label="101, Abreise"');
    expect(m).toContain('aria-label="513, Same-Day-Turn"');
    expect(m).toContain("pl-tile");
    expect(m).toMatch(/aria-label="Supervisor P"[^>]*>.*P</);
  });
  it("Textalternative: versteckte Tabelle je Etage mit belegt, Abreisen, Bleiber", () => {
    const m = map(house(true));
    expect(m).toContain('<table class="sr-only">');
    expect(m).toContain("<caption>Zimmer je Etage heute</caption>");
    expect(m.match(/<tr>/g)!.length).toBeGreaterThanOrEqual(6); // Kopf + 5 Etagen
  });
  it("Etagen stehen in der Reihenfolge 5 → 1", () => {
    const order = [...map(house(true)).matchAll(/aria-hidden="true">(\d)<\/div>/g)].map((x) => Number(x[1]));
    expect(order).toEqual([5, 4, 3, 2, 1]);
  });
  it("Hervorhebung nach Nachimport und Lichtstrahl nur auf Anforderung", () => {
    expect(map(house(true), { highlight: new Set(["101"]) })).toContain("pl-flash");
    expect(map(house(true))).not.toContain("pl-beam");
    expect(map(house(true), { beamKey: 1 })).toContain("pl-beam");
  });
  it("keine Gastnamen im Haus (Kacheln tragen nur Nummer und Art)", () => {
    const m = map(house(true));
    expect(m).not.toMatch(/Mr\.|Mrs\.|Frau |Herr /);
  });
});

describe("Stepper (Rendering)", () => {
  const labels = { 1: "Listen", 2: "Team", 3: "Etagen", 4: "Plan" } as const;
  it("aktueller Schritt: aria-current, erledigter mit Häkchen, spätere gesperrt (echte Buttons)", () => {
    const m = renderToStaticMarkup(h(Stepper, { current: 2, reached: 2, labels, onSelect: () => {}, ariaLabel: "Schritte" }));
    expect(m).toContain('aria-current="step"');
    expect(m).toContain('aria-label="Listen ✓"');
    expect((m.match(/<button/g) ?? []).length).toBe(4);
    expect((m.match(/disabled=""/g) ?? []).length).toBe(2); // Schritte 3 und 4
  });
});

describe("Dateikarte (Rendering)", () => {
  it("jeder Status steht als Text, nicht nur als Farbe; Befund mit Symbol", () => {
    const m = renderToStaticMarkup(h(FileDropCard, { title: "Arrivals: Detailed", subtitle: "x", status: "warning", statusLabel: "gelesen — Hinweis", resultText: "9 Zeilen", issues: [{ severity: "WARNING", message: "Seite 2 von 2 fehlt" }] }));
    expect(m).toContain("gelesen — Hinweis");
    expect(m).toContain("⚠");
    expect(m).toContain("Seite 2 von 2 fehlt");
    const r = renderToStaticMarkup(h(FileDropCard, { title: "Departures", subtitle: "x", status: "reading", statusLabel: "liest…" }));
    expect(r).toContain("pl-spin");
    expect(r).toContain("pl-run");
  });
});

describe("Bewegung (CSS)", () => {
  const css = readFileSync(path.join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");
  it("Keyframes des Planungstools animieren nur transform und opacity", () => {
    // Klammern zählen (Keyframes stehen teils in einer Zeile)
    const names: string[] = [];
    for (const m of css.matchAll(/@keyframes (pl-[a-z]+) \{/g)) {
      let depth = 1, i = m.index! + m[0].length;
      while (depth > 0 && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
      const body = css.slice(m.index! + m[0].length, i - 1);
      names.push(m[1]);
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
      for (const p of props) expect(["transform", "opacity"], `${m[1]}: ${p}`).toContain(p);
    }
    expect(names.length).toBeGreaterThanOrEqual(10);
  });
  it("prefers-reduced-motion schaltet alle Animationen im Planungstool aus", () => {
    const m = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.planung-root[\s\S]*?\n\}/);
    expect(m?.[0]).toMatch(/animation: none !important/);
    expect(m?.[0]).toMatch(/\.planung-root \*/);
  });
  it("Dauerschleifen nur bei Spinner, Laufbalken und Ring-Puls", () => {
    const infinite = [...css.matchAll(/\.(pl-[a-z:-]+)[^{]*\{[^}]*infinite/g)].map((m) => m[1]).sort();
    expect(infinite).toEqual(["pl-ring::after", "pl-run", "pl-spin"]);
  });
});

describe("Zugriff", () => {
  const read = (p: string) => readFileSync(path.join(__dirname, "..", "..", "src", p), "utf8");
  it("/planung nur für Duty Manager und Supervisor (nicht für Housekeeper), API ebenso", () => {
    expect(read("app/planung/page.tsx")).toMatch(/requirePage\(\["supervisor", "duty_manager"\]\)/);
    expect(read("app/api/planung/house/route.ts")).toMatch(/requireRole\(\["supervisor"\]\)/);
  });
});
