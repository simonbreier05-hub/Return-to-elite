import { describe, expect, it } from "vitest";
import { extractPdfLines } from "@/lib/import/pdfText";
import { parseArrivals, parseDepartures, parseForecast } from "@/lib/import/parsers";
import { SubmitBatchSchema } from "@/lib/import/schema";
import { buildArrivalsPdf, buildDeparturesPdf, buildForecastPdf } from "./fixtures/opera/build";

const hash = "a".repeat(64);
const body = (r: { type: string; rows: unknown[]; issues: unknown[]; reportDate: string | null; periodFrom: string | null; periodTo: string | null }) =>
  ({ type: r.type, fileHash: hash, reportDate: r.reportDate, periodFrom: r.periodFrom, periodTo: r.periodTo, issues: r.issues, rows: r.rows });

describe("Server-Whitelist (SubmitBatchSchema)", () => {
  it("nimmt die echte Parser-Ausgabe aller drei PDF-Listen an", async () => {
    for (const r of [
      parseArrivals(await extractPdfLines(await buildArrivalsPdf())),
      parseDepartures(await extractPdfLines(await buildDeparturesPdf())),
      parseForecast(await extractPdfLines(await buildForecastPdf())),
    ]) {
      expect(SubmitBatchSchema.safeParse(body(r)).success, r.type).toBe(true);
    }
  });

  it("lehnt jedes zusätzliche Feld ab (Kartennummer, Preis, Saldo …)", async () => {
    const r = parseDepartures(await extractPdfLines(await buildDeparturesPdf()));
    for (const extra of [{ creditCard: "4111111111111111" }, { balance: 157.2 }, { rate: "399.00" }, { confNo: "1916877" }]) {
      const rows = r.rows.map((x, i) => (i === 0 ? { ...x, ...extra } : x));
      expect(SubmitBatchSchema.safeParse(body({ ...r, rows })).success).toBe(false);
    }
    expect(SubmitBatchSchema.safeParse({ ...body(r), creditCard: "x" }).success).toBe(false);
  });

  it("lehnt Befund-Meldungen mit langer Zahl ab und prüft Zeilen gegen den Listentyp", async () => {
    const r = parseDepartures(await extractPdfLines(await buildDeparturesPdf()));
    const bad = [{ severity: "INFO", code: "X", message: "Karte 4111111111111111" }];
    expect(SubmitBatchSchema.safeParse(body({ ...r, issues: bad })).success).toBe(false);
    expect(SubmitBatchSchema.safeParse(body({ ...r, type: "FORECAST" })).success).toBe(false);
  });
});
