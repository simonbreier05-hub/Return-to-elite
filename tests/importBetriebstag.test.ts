import { describe, expect, it } from "vitest";
import { berlinToday, freshState, implausibleDateCount } from "@/lib/import/businessDay";
import { findHeaderDateRaw } from "@/lib/import/parseCommon";
import { extractPdfLines } from "@/lib/import/pdfText";
import { parseForecast, salutationIssues } from "@/lib/import/parsers";
import { listBlockers, listStateOf, planningAllowed } from "@/lib/import/readiness";
import { loadList, parseList } from "@/lib/import/readFile";
import { parseGuestName } from "@/lib/import/names";
import type { PdfLine } from "@/lib/import/types";
import { buildDeparturesPdf, buildForecastPdf } from "./fixtures/opera/build";
import { DEMO } from "./fixtures/opera/build";

const L = (segments: string[], y: number, page = 1): PdfLine => ({ page, y: -y, segments, text: segments.join(" ") });

describe("Druckdatum aus dem Kopf (Opera-Kopfzeile ohne Label)", () => {
  it("Datum und Uhrzeit ohne Label direkt unter dem Titel — auch wenn der Kopf nicht erkannt wurde (leerer Kopf)", () => {
    const lines = [L(["Hotel Demo"], 0), L(["History and Forecast"], 1), L(["06/10/26"], 2), L(["07:06"], 3), L(["Date", "Total Occ."], 4)];
    expect(findHeaderDateRaw([], lines)).toBe("06/10/26");
  });
  it("Datum + Uhrzeit in einer Zelle", () => {
    expect(findHeaderDateRaw([L(["Titel"], 0), L(["06/10/26 07:06"], 1)])).toBe("06/10/26");
  });
  it("Label (de/en) hat Vorrang", () => {
    expect(findHeaderDateRaw([L(["Printed on: 06/10/26"], 0), L(["01/01/20"], 1)])).toBe("06/10/26");
    expect(findHeaderDateRaw([L(["Druckdatum 06.10.2026"], 0)])).toBe("06.10.2026");
  });
  it("Filterzeilen und Datenzeilen sind kein Druckdatum; nichts gefunden → null", () => {
    expect(findHeaderDateRaw([], [L(["Filter: From Date", "29/09/26", "To Date", "28/10/26"], 0), L(["101", "Muster", "05-15-18", "05-16-18"], 1)])).toBeNull();
  });
});

describe("Forecast ohne lesbares Druckdatum", () => {
  it("Betriebstag (App-Uhr) genügt: kein TODAY_UNKNOWN, Zeilen ab heute", async () => {
    const lines = (await extractPdfLines(await buildForecastPdf())).filter((l) => !l.segments.some((s) => s === DEMO.forecast.printDate) && l.text !== "07:06");
    const r = parseForecast(lines, { expectedDate: "2026-10-06" });
    expect(r.issues.map((i) => i.code)).not.toContain("TODAY_UNKNOWN");
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.date >= "2026-10-06")).toBe(true);
  });
  it("Ersatz: erste Datumszeile unter „Forecast“ liefert das Druckdatum", async () => {
    const lines = (await extractPdfLines(await buildForecastPdf())).filter((l) => !l.segments.some((s) => s === DEMO.forecast.printDate) && l.text !== "07:06");
    const r = parseForecast(lines, {});
    expect(r.issues.map((i) => i.code)).not.toContain("TODAY_UNKNOWN");
    expect(r.reportDate).toBe("2026-09-22");
  });
});

describe("Datumsformat gegen Betriebstag", () => {
  it("zählt Abreisen/Anreisen in der Vergangenheit", () => {
    const rows = [{ arrDate: "2026-10-23", depDate: "2026-10-25" }, { arrDate: "2026-10-01", depDate: "2026-10-02" }];
    expect(implausibleDateCount("DEPARTURES", rows, "2026-10-23")).toBe(1);
    expect(implausibleDateCount("ARRIVALS", rows, "2026-10-23")).toBe(1);
    expect(implausibleDateCount("FORECAST", rows, "2026-10-23")).toBe(0);
  });
  it("Abweichung vom gespeicherten Layout ist nur ein Hinweis, wenn die Daten zum Betriebstag passen", async () => {
    const list = await loadList("departure_all.pdf", await buildDeparturesPdf());
    const r = parseList("DEPARTURES", list, { today: "2018-05-01", layoutDateFormat: "DMY" });
    const d = r.issues.find((i) => i.code === "DATE_FORMAT_DIFFERS");
    expect(d?.severity).toBe("INFO");
    expect(r.issues.map((i) => i.code)).not.toContain("DATE_IMPLAUSIBLE");
  });
  it("ohne Betriebstag-Abgleich bleibt es eine Warnung", async () => {
    const list = await loadList("departure_all.pdf", await buildDeparturesPdf());
    const r = parseList("DEPARTURES", list, { layoutDateFormat: "DMY" });
    expect(r.issues.find((i) => i.code === "DATE_FORMAT_DIFFERS")?.severity).toBe("WARNING");
  });
});

describe("Anrede ist optional", () => {
  it("fehlt sie bei allen Zeilen: genau ein Hinweis, keine Warnung", () => {
    const rows = Array.from({ length: 32 }, () => ({ guest: parseGuestName("Muster, Max") }));
    const is = salutationIssues(rows);
    expect(is).toHaveLength(1);
    expect(is[0]).toMatchObject({ severity: "INFO", code: "NO_SALUTATION_COLUMN" });
  });
  it("teilweise fehlend: ein INFO mit Zähler; keine fehlende: nichts", () => {
    expect(salutationIssues([{ guest: parseGuestName("Herr Max Muster") }, { guest: parseGuestName("Muster, Max") }])[0].code).toBe("NO_SALUTATION");
    expect(salutationIssues([{ guest: parseGuestName("Herr Max Muster") }])).toEqual([]);
  });
  it("Anrede in eigener Spalte neben dem Namen wird erkannt", () => {
    expect(parseGuestName("Muster, Max", undefined, ["Frau"]).salutation).toBe("Frau");
  });
});

describe("Betriebstag-Gate", () => {
  const today = "2026-10-23";
  const all = (d: string, acc = false) => ({ businessDate: d, staleAccepted: acc });
  const status = (over: Record<string, ReturnType<typeof all> | null> = {}) => ({
    FORECAST: all(today), DEPARTURES: all(today), ARRIVALS: all(today), TRACES: all(today), INHOUSE: all(today), ...over,
  });
  it("Betriebstag = Berlin, nicht UTC", () => {
    expect(berlinToday(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
  });
  it("alle fünf von heute → frei", () => expect(planningAllowed(status(), today)).toBe(true));
  it("Liste vom 06.10. zählt nicht (veraltet)", () => {
    const s = status({ DEPARTURES: all("2026-10-06"), TRACES: all("2026-10-06"), INHOUSE: all("2026-10-06") });
    expect(planningAllowed(s, today)).toBe(false);
    expect(listBlockers(s, today).stale.map((x) => x.type)).toEqual(["DEPARTURES", "TRACES", "INHOUSE"]);
  });
  it("mit Bestätigung („Trotzdem verwenden“) zählt sie", () => {
    const s = status({ DEPARTURES: all("2026-10-06", true) });
    expect(planningAllowed(s, today)).toBe(true);
    expect(listStateOf(s.DEPARTURES, today)).toBe("accepted");
    expect(freshState("2026-10-06", today, false)).toBe("stale");
  });
  it("fehlende Liste blockiert weiterhin", () => expect(planningAllowed(status({ FORECAST: null }), today)).toBe(false));
});
