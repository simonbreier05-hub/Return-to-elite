import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadList, parseList } from "@/lib/import/readFile";
import { deriveDayPlan } from "@/lib/dayplan/derive";
import { checkPlausibility } from "@/lib/import/plausibility";
import type { ArrivalRow, DepartureRow, ForecastDayRow, InHouseRow, TraceRow } from "@/lib/import/types";

/**
 * Die fünf Opera-Listen vom 28.10.2026 (Nachbau mit reportlab, erfundene Namen — tests/fixtures/opera/2026-10-28/make_fixtures.py):
 * mehrseitig, Kopfzeile je Seite, Etagenüberschriften, optionale Firma/VIP (V1/V2)/Trace-Markierung „T“, Typen XAS/XDL, Kinder > 0.
 */
const DIR = join(__dirname, "fixtures/opera/2026-10-28");
const DAY = "2026-10-28";
const EXP = JSON.parse(readFileSync(join(DIR, "expected.json"), "utf8"));
async function read<T>(file: string) {
  const list = await loadList(file, new Uint8Array(readFileSync(join(DIR, file))));
  const r = parseList(list.type!, list, { today: DAY, expectedDate: DAY, roomInventory: 145 });
  return { type: list.type, rows: r.rows as unknown as T[], issues: r.issues, pages: r.pagesSeen };
}
const noLoss = (issues: { severity: string; code: string }[]) => {
  expect(issues.filter((i) => i.severity === "CRITICAL")).toEqual([]);
  expect(issues.map((i) => i.code)).not.toContain("ROW_SKIPPED");
  expect(issues.map((i) => i.code)).not.toContain("PAGE_MISSING");
};

describe("Opera-Listen 28.10.2026: alle Zeilen erkannt", () => {
  it("In-House: 113 Zimmer = 38 RESV + 75 CKIN, über alle Seiten, Personen 155", async () => {
    const r = await read<InHouseRow>("inhouse_28-10-26.pdf");
    expect(r.type).toBe("INHOUSE");
    expect(r.pages).toBeGreaterThan(1);
    noLoss(r.issues);
    expect(r.rows).toHaveLength(113);
    expect(r.rows.filter((x) => x.status === "RESV")).toHaveLength(38);
    expect(r.rows.filter((x) => x.status === "CKIN")).toHaveLength(75);
    expect(r.rows.reduce((a, x) => a + x.adults + x.children, 0)).toBe(155);
    expect(r.rows.filter((x) => x.children > 0)).toHaveLength(6);
    expect(new Set(r.rows.map((x) => x.roomType))).toEqual(new Set(["STDK", "DLXK", "XAS", "XDL", "JSK"]));
    expect(r.rows.filter((x) => x.vip).length).toBeGreaterThan(0);
  });

  it("Departures: 71 Zeilen über drei Tage (26 / 24 / 21)", async () => {
    const r = await read<DepartureRow>("departures_28-10-26.pdf");
    noLoss(r.issues);
    expect(r.rows).toHaveLength(71);
    const by = (d: string) => r.rows.filter((x) => x.depDate === d).length;
    expect([by("2026-10-28"), by("2026-10-29"), by("2026-10-30")]).toEqual([26, 24, 21]);
    expect(r.issues.map((i) => i.code)).not.toContain("TOTAL_MISMATCH");
  });

  it("Arrivals: 38 Anreisen", async () => {
    const r = await read<ArrivalRow>("arrivals_28-10-26.pdf");
    noLoss(r.issues);
    expect(r.rows).toHaveLength(38);
    expect(r.rows.every((x) => x.arrDate === DAY)).toBe(true);
  });

  it("Traces: 44 Zeilen gelesen, 30 offen übernommen, 14 erledigte übersprungen", async () => {
    const r = await read<TraceRow>("traces_28-10-26.pdf");
    noLoss(r.issues);
    expect(r.rows).toHaveLength(30);
    expect(r.issues.find((i) => i.code === "RESOLVED_SKIPPED")?.message).toMatch(/^14 /);
    const by = (d: string) => r.rows.filter((x) => x.dept === d).length;
    expect([by("HM"), by("HK"), by("FO"), by("ENG")]).toEqual([13, 10, 6, 1]);
  });

  it("Forecast: Zeile des Tages 113 belegt, 38 Anreisen, 26 Abreisen, 155 Personen, 3 OOO, 79,58 %", async () => {
    const r = await read<ForecastDayRow>("forecast_28-10-26.pdf");
    noLoss(r.issues);
    expect(r.rows.find((x) => x.date === DAY)).toMatchObject({ occupiedRooms: 113, arrivals: 38, departures: 26, persons: 155, outOfOrder: 3, occupancyPct: 79.58 });
    expect(r.rows.find((x) => x.date === "2026-10-29")).toMatchObject({ departures: 24 });
  });
});

describe("Tagesplan aus den fünf Listen", () => {
  it("mit In-House: 75 Bleiber, 26 Abreisen heute (12 Turns), 38 Anreisen, 113 heute Nacht belegt, 101 zu reinigen", async () => {
    const [d, a, ih] = await Promise.all([read<DepartureRow>("departures_28-10-26.pdf"), read<ArrivalRow>("arrivals_28-10-26.pdf"), read<InHouseRow>("inhouse_28-10-26.pdf")]);
    const p = deriveDayPlan({ date: DAY, departures: d.rows, arrivals: a.rows, inHouse: ih.rows, linenCycleDays: 3 });
    expect(p.figures).toEqual({ departures: 26, arrivals: 38, stayovers: 75, eveningOccupancy: 113, cleaningCount: 101 });
    const of = (t: string) => p.rooms.filter((x) => x.cleaningType === t).map((x) => x.room).sort();
    expect(of("SAME_DAY_TURN")).toEqual(EXP.rooms.turns);
    expect(of("STAYOVER")).toEqual(EXP.rooms.stayovers);
    expect(p.issues.filter((i) => i.severity !== "INFO")).toEqual([]);
  });

  it("Regression: ohne In-House fehlen alle Bleiber, die nach dem Departures-Zeitraum abreisen (das war die Ursache)", async () => {
    const [d, a] = await Promise.all([read<DepartureRow>("departures_28-10-26.pdf"), read<ArrivalRow>("arrivals_28-10-26.pdf")]);
    const p = deriveDayPlan({ date: DAY, departures: d.rows, arrivals: a.rows, linenCycleDays: 3 });
    expect(p.figures.stayovers).toBe(30); // nur die 16 + 14 Bleiber mit Abreise morgen/übermorgen
  });

  it("Plausibilität: die vollständigen Listen passen zum Forecast — keine Warnung", async () => {
    const [d, a, ih, f] = await Promise.all([read<DepartureRow>("departures_28-10-26.pdf"), read<ArrivalRow>("arrivals_28-10-26.pdf"), read<InHouseRow>("inhouse_28-10-26.pdf"), read<ForecastDayRow>("forecast_28-10-26.pdf")]);
    const p = deriveDayPlan({ date: DAY, departures: d.rows, arrivals: a.rows, inHouse: ih.rows, linenCycleDays: 3 });
    const findings = checkPlausibility({
      date: DAY, inventory: 145, forecast: f.rows.find((x) => x.date === DAY)!, inHouse: ih.rows, arrivals: a.rows, departures: d.rows,
      plan: { occupied: p.figures.eveningOccupancy, arrivals: p.figures.arrivals, departures: p.figures.departures }, unknownRooms: [],
    });
    expect(findings).toEqual([]);
  });
});
