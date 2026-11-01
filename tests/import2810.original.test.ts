import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadList, parseList } from "@/lib/import/readFile";
import { deriveDayPlan } from "@/lib/dayplan/derive";
import { checkPlausibility } from "@/lib/import/plausibility";
import type { ArrivalRow, DepartureRow, ForecastDayRow, InHouseRow, TraceRow } from "@/lib/import/types";

/** Die fünf PDFs, mit denen der Fehler auf der Preview beobachtet wurde (vom Nutzer erzeugt, erfundene Namen). */
const DIR = join(__dirname, "fixtures/opera/2026-10-28/original");
const DAY = "2026-10-28";
async function read<T>(file: string) {
  const list = await loadList(file, new Uint8Array(readFileSync(join(DIR, file))));
  const r = parseList(list.type!, list, { today: DAY, expectedDate: DAY, roomInventory: 145 });
  expect(r.issues.filter((i) => i.severity === "CRITICAL" || i.code === "ROW_SKIPPED" || i.code === "PAGE_MISSING")).toEqual([]);
  return { type: list.type, rows: r.rows as unknown as T[], issues: r.issues };
}

describe("Original-Listen 28.10.2026", () => {
  it("alle Zeilen erkannt: In-House 113 (38 RESV + 75 CKIN, 155 Personen), Departures 71 (26/24/21), Arrivals 38, Traces 44 (30 offen)", async () => {
    const ih = await read<InHouseRow>("1_InHouse_2026-10-28.pdf");
    expect(ih.type).toBe("INHOUSE");
    expect([ih.rows.length, ih.rows.filter((r) => r.status === "RESV").length, ih.rows.filter((r) => r.status === "CKIN").length]).toEqual([113, 38, 75]);
    expect(ih.rows.reduce((a, r) => a + r.adults + r.children, 0)).toBe(155);
    const dep = await read<DepartureRow>("4_Departures_2026-10-28.pdf");
    expect(["2026-10-28", "2026-10-29", "2026-10-30"].map((d) => dep.rows.filter((r) => r.depDate === d).length)).toEqual([26, 24, 21]);
    expect((await read<ArrivalRow>("5_Arrivals_2026-10-28.pdf")).rows).toHaveLength(38);
    const tr = await read<TraceRow>("3_Traces_2026-10-28.pdf");
    expect(tr.rows).toHaveLength(30);
    expect(tr.issues.find((i) => i.code === "RESOLVED_SKIPPED")?.message).toMatch(/^14 /);
    const fc = await read<ForecastDayRow>("2_History_Forecast_2026-10-28.pdf");
    expect(fc.rows.find((r) => r.date === DAY)).toMatchObject({ occupiedRooms: 113, arrivals: 38, departures: 26, persons: 155, outOfOrder: 3, occupancyPct: 79.58 });
  });

  it("Tagesplan aus allen fünf Listen: 75 Bleiber, 26 Abreisen (12 Turns), 38 Anreisen, 113 belegt, 101 zu reinigen; Plausibilität ohne Befund", async () => {
    const [dep, arr, ih, fc] = await Promise.all([read<DepartureRow>("4_Departures_2026-10-28.pdf"), read<ArrivalRow>("5_Arrivals_2026-10-28.pdf"),
      read<InHouseRow>("1_InHouse_2026-10-28.pdf"), read<ForecastDayRow>("2_History_Forecast_2026-10-28.pdf")]);
    const p = deriveDayPlan({ date: DAY, departures: dep.rows, arrivals: arr.rows, inHouse: ih.rows, linenCycleDays: 3 });
    expect(p.figures).toEqual({ departures: 26, arrivals: 38, stayovers: 75, eveningOccupancy: 113, cleaningCount: 101 });
    expect(p.rooms.filter((r) => r.cleaningType === "SAME_DAY_TURN")).toHaveLength(12);
    expect(checkPlausibility({ date: DAY, inventory: 145, forecast: fc.rows.find((r) => r.date === DAY)!, inHouse: ih.rows, arrivals: arr.rows, departures: dep.rows,
      plan: { occupied: 113, arrivals: p.figures.arrivals, departures: p.figures.departures }, unknownRooms: [] })).toEqual([]);
    // Regression: ohne In-House nur die Bleiber aus dem 3-Tage-Departures-Zeitraum
    expect(deriveDayPlan({ date: DAY, departures: dep.rows, arrivals: arr.rows, linenCycleDays: 3 }).figures.stayovers).toBeLessThan(40);
  });
});
