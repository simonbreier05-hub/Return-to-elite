import Papa from "papaparse";
import type { ImportType } from "@/lib/domain";
import { detectListType } from "./detect";
import { DEFAULT_MAPPING, type ImportMappingConfig } from "./mapping";
import { extractPdfLines } from "./pdfText";
import { decodeText, parseArrivals, parseDepartures, parseForecast, parseTracesCsv, parseTracesPdf } from "./parsers";
import type { ParseOptions, ParseResult, PdfLine } from "./types";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Eine gelesene Datei: PDF-Zeilen oder Tabellenzeilen (jede Zeile = Zellen in Druckreihenfolge). */
export interface LoadedList {
  kind: "pdf" | "sheet";
  lines: PdfLine[];
  /** Tabelle als CSV-Text — nur für die Traces-Liste (Kopfzeilen-basiert). */
  csv: string | null;
  type: ImportType | null;
}

const toLines = (rows: string[][]): PdfLine[] =>
  rows.map((cells, i) => {
    const segments = cells.map((c) => c.trim()).filter(Boolean);
    return { page: 1, y: -i, segments, text: segments.join(" ") };
  }).filter((l) => l.segments.length);

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10); // Datumszelle → JJJJ-MM-TT, eindeutig
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    return o.text ?? "";
  }
  return String(v);
}

/** Zimmernummern, die Excel als Zahl gespeichert hat (4 statt "004"), wieder auffüllen — nur 1. Zelle einer Zeile. */
const padRoom = (rows: string[][]) =>
  rows.map((r) => (r[0] && /^\d{1,2}$/.test(r[0].trim()) ? [r[0].trim().padStart(3, "0"), ...r.slice(1)] : r));

/** Liest PDF, XLSX oder CSV im Arbeitsspeicher; die Datei wird nie gespeichert. */
export async function loadList(fileName: string, bytes: Uint8Array): Promise<LoadedList> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Datei größer als 10 MB.");
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50)) {
    let lines: PdfLine[];
    try {
      lines = await extractPdfLines(bytes);
    } catch (e) {
      console.error("PDF-Import:", e);
      throw new Error("Datei konnte nicht gelesen werden. Ist es ein unbeschädigtes PDF mit Textebene (kein Foto/Scan)? Sonst bitte Excel/CSV nutzen oder einen anderen Browser probieren.");
    }
    return { kind: "pdf", lines, csv: null, type: detectListType(lines, fileName) };
  }
  let rows: string[][];
  if (lower.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.slice().buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    rows = [];
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = cellText(c.value); });
      rows.push(Array.from(cells, (c) => c ?? ""));
    });
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    rows = Papa.parse<string[]>(decodeText(bytes).replace(/^﻿/, ""), { skipEmptyLines: true }).data;
  } else {
    throw new Error("Dateityp nicht unterstützt. Bitte PDF, XLSX oder CSV hochladen.");
  }
  rows = padRoom(rows);
  const lines = toLines(rows);
  return { kind: "sheet", lines, csv: Papa.unparse(rows, { delimiter: ";" }), type: detectListType(lines, fileName) };
}

export type AnyResult = ParseResult<never>;

/** Liest eine geladene Liste als `type`. Bei Tabellen fehlt oft das Druckdatum → `opts.today` springt ein. */
export function parseList(
  type: ImportType, list: LoadedList, opts: ParseOptions = {}, cfg: ImportMappingConfig = DEFAULT_MAPPING,
): AnyResult {
  // Bei PDFs gilt das Druckdatum der Liste; `opts.today` (Formularfeld) ersetzt es nur bei Tabellen ohne Druckdatum.
  const userDay = opts.today;
  opts = { ...opts, expectedDate: opts.expectedDate ?? userDay, ...(list.kind === "pdf" ? { today: undefined } : {}) };
  let r: AnyResult;
  if (type === "TRACES") {
    r = (list.kind === "sheet" ? parseTracesCsv(list.csv ?? "", opts, cfg) : parseTracesPdf(list.lines, opts, cfg)) as unknown as AnyResult;
  } else {
    const fn = { ARRIVALS: parseArrivals, DEPARTURES: parseDepartures, FORECAST: parseForecast }[type];
    r = fn(list.lines, opts, cfg) as unknown as AnyResult;
  }
  if (list.kind === "sheet" && userDay) {
    r.reportDate ??= userDay;
    if (type === "ARRIVALS") r.periodFrom ??= userDay;
  }
  if (userDay && r.reportDate && r.reportDate !== userDay) {
    r.issues.push({ severity: "WARNING", code: "LIST_NOT_TODAY", message: `Die Liste ist vom ${r.reportDate}, ausgewählt ist der ${userDay}. Veraltete Liste?` });
  }
  return r;
}
