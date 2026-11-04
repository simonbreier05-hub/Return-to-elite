import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { floorProgress, occupancyPercent } from "@/lib/ui/dutyHouse";
import { FLOORS } from "@/lib/domain";
import { DutyHouse } from "@/components/dutymanager/DutyHouse";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";
import type { GlanceKpis } from "@/lib/dayplan/glance";

describe("Duty Manager Haus: Anzeige-Regeln", () => {
  it("Belegung in ganzen Prozent, ohne Inventar 0", () => {
    expect(occupancyPercent(87, 145)).toBe(60);
    expect(occupancyPercent(0, 145)).toBe(0);
    expect(occupancyPercent(5, 0)).toBe(0);
  });
  it("Etagenfortschritt: nur Zimmer aus den Daten, Etagen aus FLOORS, nichts dazuerfunden", () => {
    const rooms = [
      { floor: 1, status: "INSPECTED" },
      { floor: 1, status: "DIRTY" },
      { floor: 1, status: "OUT_OF_ORDER" },
      { floor: 2, status: "INSPECTED" },
    ];
    const p = floorProgress(rooms);
    expect(p.map((f) => f.floor)).toEqual([...FLOORS]);
    expect(p[0]).toMatchObject({ floor: 1, done: 1, total: 2, percent: 50, rooms: 3 });
    expect(p[1]).toMatchObject({ done: 1, total: 1, percent: 100 });
    // Etage ohne Zimmer im Datenbestand bleibt leer — keine 501–512 und keine Ersatzzahl
    const last = p[p.length - 1];
    expect(last.rooms).toBe(0);
    expect(last.total).toBe(0);
  });
});

const numbers = {
  inventory: 145, occupied: 87, toClean: 60, assigned: 40, cleaned: 10, open: 20, openIds: [],
  notCleaned: { total: 0, byReason: { outOfOrder: 0, outOfService: 0, optOut: 0 }, ids: [] },
  byKind: { DEPARTURE: 0, TURN: 0, STAYOVER: 0, ARRIVAL: 0 }, laundryDue: null,
  arrivalChecks: { total: 0, released: 0, openIds: [] }, outsideTeam: 0, doneUnassigned: 0,
} as unknown as DayNumbers;
const kpis = { arrivals: 12, departures: 9, dnd: 2, openDefects: 3, openHouseTasks: 1,
  progress: { inspected: 0, sellable: 0, percent: 0 }, dndBlocked: { dnd: 2, blocked: 0 } } as GlanceKpis;

describe("DutyHouse (Render)", () => {
  const html = renderToStaticMarkup(
    h(LocaleProvider, null, h(DutyHouse, {
      numbers, kpis, rooms: [{ floor: 1, status: "INSPECTED" }], unassignedFloors: 1,
      plan: { confirmed: false, listsChanged: false }, open: () => {},
    })),
  );
  it("zeigt Belegung, KPIs, Etagen 1–5 und Planstatus mit Glas-Bausteinen", () => {
    expect(html).toContain("60");
    expect(html).toContain("87 von 145");
    for (const f of FLOORS) expect(html).toContain(`Etage ${f}`);
    expect(html).toContain("Plan noch nicht bestätigt");
    expect(html).toContain('href="/planung"');
    expect(html).toContain("glass");
    expect(html).not.toMatch(/backdrop|blur\(|bg-navy|bg-linen|bg-ivory/);
  });
  it("kein Planstatus, wenn er nicht geladen ist", () => {
    const none = renderToStaticMarkup(
      h(LocaleProvider, null, h(DutyHouse, { numbers, kpis, rooms: [], unassignedFloors: 0, plan: null, open: () => {} })),
    );
    expect(none).not.toContain("Planstatus");
  });
});

describe("Duty Manager Haus: Etage 5 und Zahlen (D4-Abschluss)", () => {
  it("Etage 5 zählt nur vorhandene Zimmer (513 ff.) — 501–512 werden nie ergänzt", () => {
    const rooms = [513, 514, 515].map((n, i) => ({ floor: 5, number: String(n), status: i === 0 ? "INSPECTED" : "DIRTY" }));
    const f5 = floorProgress(rooms).find((f) => f.floor === 5)!;
    expect(f5).toMatchObject({ rooms: 3, done: 1, total: 3, percent: 33 });
  });
  it("eigene Etagenliste wird in ihrer Reihenfolge übernommen", () => {
    expect(floorProgress([], [3, 1]).map((f) => f.floor)).toEqual([3, 1]);
  });
  it("Etagen arabisch, Planstatus als Text (nicht nur Farbe), bestätigter Plan und geänderte Listen", () => {
    const out = renderToStaticMarkup(
      h(LocaleProvider, null, h(DutyHouse, { numbers, kpis, rooms: [], unassignedFloors: 0, plan: { confirmed: true, listsChanged: true }, open: () => {} })),
    );
    expect(out).toContain("Etage 5");
    expect(out).not.toMatch(/Etage (I|II|III|IV|V)\b/);
    expect(out).not.toContain("Plan noch nicht bestätigt");
    expect(out).toMatch(/Plan bestätigt/);
    expect(out).toContain("geändert");
    expect(out).not.toMatch(/#[0-9a-fA-F]{6}\b|rgba?\(/);
  });
});
