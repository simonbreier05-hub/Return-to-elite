import { describe, expect, it } from "vitest";
import { extractPdfLines } from "@/lib/import/pdfText";
import {
  crossCheckArrivals, decodeText, parseArrivals, parseDepartures, parseForecast, parseTracesCsv, parseTracesPdf,
} from "@/lib/import/parsers";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import { buildArrivalsPdf, buildDeparturesPdf, buildForecastPdf, buildTracesPdf } from "./fixtures/opera/build";
import { GUESTS } from "./fixtures/opera/scenario";
import { TRACES_SAMPLE } from "./fixtures/opera/tracesSample";
import { readFileSync } from "node:fs";
import path from "node:path";

const lines = async (pdf: Uint8Array) => extractPdfLines(pdf);
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe("Arrivals: Detailed", () => {
  it("liest Seite 1 mit 9 Zimmern und 3 Traces", async () => {
    const r = parseArrivals(await lines(await buildArrivalsPdf({ onlyFirstPage: true })));
    expect(r.rows.map((x) => x.room)).toEqual(["004", "101", "203", "204", "209", "301", "624", "625", "626"]);
    expect(r.rows.flatMap((x) => x.traces.map(() => x.room))).toEqual(["004", "203", "626"]);
    expect(codes(r)).toContain("PAGE_MISSING");
    expect(r.pagesSeen).toBe(1);
    expect(r.pagesTotal).toBe(2);
  });

  it("liest beide Seiten ohne Warnung 'Seite fehlt'", async () => {
    const r = parseArrivals(await lines(await buildArrivalsPdf()));
    expect(r.rows).toHaveLength(13);
    expect(codes(r)).not.toContain("PAGE_MISSING");
    expect(r.dates).toMatchObject({ format: "MDY", via: "unique" });
  });

  it("liest Felder: Datum, Zeit (12h, '*', abgeschnittenes AN), Personen, Status, VIP", async () => {
    const r = parseArrivals(await lines(await buildArrivalsPdf()));
    const by = Object.fromEntries(r.rows.map((x) => [x.room, x]));
    expect(by["004"]).toMatchObject({ arrDate: "2018-05-15", depDate: "2018-05-17", arrTime: "02:03", adults: 1, children: 0, status: "CKIN", vip: false });
    expect(by["625"].arrTime).toBe("23:31");
    expect(by["209"].arrTime).toBe("04:30"); // "*04:30 AN" (abgeschnitten)
    expect(by["204"].children).toBe(7);
    expect(by["301"].vip).toBe(true);
    expect(by["101"].status).toBe("DUOT");
    expect(by["301"].guest).toMatchObject({ lastName: "Demo", title: "Dr.", salutation: "Mr." });
    expect(by["004"].traces[0]).toEqual({ code: "BQ", date: "2018-05-15", text: "Give extra chair & Notepad" });
  });

  it("nimmt das Anreisedatum der Liste als Geschäftsdatum, Druckdatum nur als Hinweis", async () => {
    const r = parseArrivals(await lines(await buildArrivalsPdf()));
    expect(r.periodFrom).toBe("2018-05-15");
    expect(r.reportDate).toBe("2018-05-16");
    expect(codes(r)).toContain("REPORT_DATE_DIFFERS");
  });

  it("fragt bei mehrdeutigem Datum nach statt zu raten, und liest nach Bestätigung", async () => {
    const guests = GUESTS.slice(0, 3).map((g) => ({ ...g, arr: "05-10-18", dep: "05-11-18", traces: [] as typeof g.traces }));
    const pdf = await buildArrivalsPdf({ guests, pageRooms: guests.map((g) => g.room), listDay: "05-10-18", reportDate: "05-11-18" });
    const r = parseArrivals(await lines(pdf));
    expect(r.dates.format).toBeNull();
    expect(r.dates.via).toBe("ambiguous");
    expect(r.dates.readings).toMatchObject({ MDY: { min: "2018-05-10" }, DMY: { min: "2018-10-05" } });
    expect(r.issues.find((i) => i.code === "DATE_AMBIGUOUS")?.severity).toBe("CRITICAL");
    expect(r.rows).toHaveLength(0);
    const ok = parseArrivals(await lines(pdf), { confirmedDateFormat: "MDY" });
    expect(ok.rows).toHaveLength(3);
    expect(ok.rows[0].arrDate).toBe("2018-05-10");
  });
});

describe("Departures", () => {
  it("liest 13 Zimmer in 3 Gruppen; Bleiber/Abreise, Nächte, 'Nts+Zimmertyp' ohne Leerzeichen", async () => {
    const r = parseDepartures(await lines(await buildDeparturesPdf()));
    expect(r.rows).toHaveLength(13);
    const byDep = (d: string) => r.rows.filter((x) => x.depDate === d).map((x) => x.room);
    expect(byDep("2018-05-16")).toEqual(["101", "625", "901", "902"]);
    expect(byDep("2018-05-17")).toEqual(["004", "624", "903"]);
    expect(byDep("2018-05-19")).toHaveLength(6);
    const r805 = r.rows.find((x) => x.room === "805")!;
    expect(r805).toMatchObject({ adults: 2, children: 1, nights: 4, status: "CKIN" });
    expect(r.rows.find((x) => x.room === "901")!.nights).toBe(1); // "1LFAMIL"
    expect(r.periodFrom).toBe("2018-05-15");
    expect(r.periodTo).toBe("2018-05-19");
    expect(codes(r)).not.toContain("TOTAL_MISMATCH");
  });

  it("warnt bei zu kurzem Exportzeitraum", async () => {
    const r = parseDepartures(await lines(await buildDeparturesPdf()));
    expect(codes(r)).toContain("PERIOD_SHORT");
  });

  it("erkennt eine falsche Summenzeile", async () => {
    const r = parseDepartures(await lines(await buildDeparturesPdf({ breakTotals: true })));
    expect(codes(r)).toContain("TOTAL_MISMATCH");
  });

  it("Gegenprobe: fehlende Arrivals-Seite 2 wird über die Departures erkannt", async () => {
    const dep = parseDepartures(await lines(await buildDeparturesPdf()));
    const arr = parseArrivals(await lines(await buildArrivalsPdf({ onlyFirstPage: true })));
    const issues = crossCheckArrivals(arr, dep);
    expect(issues[0].code).toBe("ARRIVALS_INCOMPLETE");
    expect(issues[0].message).toContain("805, 901, 902, 903");
    expect(crossCheckArrivals(parseArrivals(await lines(await buildArrivalsPdf())), dep)).toEqual([]);
  });
});

describe("Forecast", () => {
  it("übernimmt nur heute und später: 23 Tage, 22.09.–14.10.26", async () => {
    const r = parseForecast(await lines(await buildForecastPdf()));
    expect(r.rows).toHaveLength(23);
    expect(r.periodFrom).toBe("2026-09-22");
    expect(r.periodTo).toBe("2026-10-14");
    expect(r.reportDate).toBe("2026-09-22");
    expect(r.dates).toMatchObject({ format: "DMY" });
    expect(codes(r)).not.toContain("OCC_IMPLAUSIBLE");
  });

  it("verwirft Umsatz und Durchschnittspreis", async () => {
    const r = parseForecast(await lines(await buildForecastPdf()));
    expect(Object.keys(r.rows[0]).sort()).toEqual(
      ["arrivals", "date", "dayUse", "departures", "noShow", "occupancyPct", "occupiedRooms", "outOfOrder", "persons"]);
  });

  it("warnt bei unplausibler Auslastung", async () => {
    const r = parseForecast(await lines(await buildForecastPdf({ wrongOccAt: 10 })));
    expect(codes(r)).toContain("OCC_IMPLAUSIBLE");
  });

  it("löst 05/10/26 über den Wochentag auf (Montag = 5. Oktober)", async () => {
    const r = parseForecast(await lines(await buildForecastPdf()));
    expect(r.rows.find((x) => x.date === "2026-10-05")).toBeTruthy();
    expect(r.rows.find((x) => x.date === "2026-05-10")).toBeUndefined();
  });

  it("ohne Wochentag und mit Tag/Monat ≤ 12 gibt es keinen Raten — hier sind aber Tage > 12 dabei", async () => {
    const r = parseForecast(await lines(await buildForecastPdf({ dmyAmbiguousNoWeekday: true })));
    expect(r.dates.via).toBe("unique");
    expect(r.dates.format).toBe("DMY");
  });
});

describe("Traces", () => {
  it("PDF und CSV liefern dieselben offenen Traces; erledigte werden übersprungen", async () => {
    const pdf = parseTracesPdf(await lines(await buildTracesPdf()));
    const csv = parseTracesCsv(decodeText(readFileSync(path.join(__dirname, "fixtures/opera/traces_nachbau.csv"))));
    expect(pdf.rows).toHaveLength(11);
    expect(csv.rows.map((r) => [r.room, r.code, r.date, r.text])).toEqual(pdf.rows.map((r) => [r.room, r.code, r.date, r.text]));
    expect(codes(pdf)).toContain("RESOLVED_SKIPPED");
  });

  it("Morgenablauf: Twin/Zusatzbett-Traces ergeben Hausmann-Aufgaben", async () => {
    const r = parseTracesPdf(await lines(await buildTracesPdf()));
    const tasks = r.rows.map((t) => ({ room: t.room, task: classifyTraceText(t.text) })).filter((t) => t.task);
    expect(tasks.map((t) => `${t.room}:${t.task!.type}`)).toEqual(
      ["301:TWIN_SETUP", "209:TWIN_SETUP", "805:SONSTIGES", "204:SONSTIGES", "903:SONSTIGES", "624:TWIN_REVERT"]);
    expect(TRACES_SAMPLE.length).toBe(12);
  });

  it("CSV mit Windows-1252 und fehlender Pflichtspalte", () => {
    const bytes = new Uint8Array(Buffer.from("Zimmer;Datum;Text\n301;05-16-18;Twin Bett für Müller\n", "latin1"));
    const r = parseTracesCsv(decodeText(bytes));
    expect(r.rows[0].text).toContain("Müller");
    expect(parseTracesCsv("Foo;Bar\n1;2\n").issues[0].code).toBe("COLUMN_MISSING");
  });
});

describe("Foto/Scan und Datenschutz-Whitelist", () => {
  it("PDF ohne Textebene → kritische Meldung", () => {
    for (const fn of [parseArrivals, parseDepartures, parseForecast, parseTracesPdf]) {
      const r = fn([]);
      expect(r.issues[0]).toMatchObject({ severity: "CRITICAL", code: "NO_TEXT" });
      expect(r.issues[0].message).toContain("Foto/Scan wird nicht unterstützt");
    }
  });

  it("kein verworfenes Feld taucht im Ergebnis oder in den Meldungen auf", async () => {
    const results = [
      parseArrivals(await lines(await buildArrivalsPdf())),
      parseDepartures(await lines(await buildDeparturesPdf())),
      parseForecast(await lines(await buildForecastPdf())),
    ];
    const dump = JSON.stringify(results);
    const secrets = [
      "4111111111111111", "1916877", "1921914", // Kartennummer, Conf No.
      "399.00", "50.00", "150.00", "619.00", "157.20", "1,125.60", "896.80", // Preise, Saldo
      "RACK", "SOD1", "BLK9", "Banquet", "TICKCHD", "Park Ticket", "C- Oracle", // Codes, Fixed Charges, Inventar, Firma
      "1,378,840.96", "476.94", "19,200.00", // Forecast-Umsatz/Durchschnittspreis
    ];
    for (const s of secrets) expect(dump, s).not.toContain(s);
  });

  it("Meldungen enthalten keine Gastnamen", async () => {
    const results = [
      parseArrivals(await lines(await buildArrivalsPdf({ onlyFirstPage: true }))),
      parseDepartures(await lines(await buildDeparturesPdf({ breakTotals: true }))),
    ];
    const msgs = JSON.stringify(results.flatMap((r) => r.issues));
    for (const g of GUESTS) expect(msgs).not.toContain(g.name.split(",")[0]);
  });
});
