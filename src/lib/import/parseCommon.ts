import { resolveDateFormat, toIso } from "./dates";
import type { DateFormatId, DateResolution, ParseIssue, PdfLine } from "./types";

export const DATE_RE = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
export const ROOM_RE = /^\d{3,4}$/;

export function issue(
  severity: ParseIssue["severity"], code: string, message: string,
  extra: Partial<Pick<ParseIssue, "page" | "line" | "room">> = {},
): ParseIssue {
  return { severity, code, message, ...extra };
}

/** Seitenzahlen "Page 1 of 2" aus den Fußzeilen. */
export function pageInfo(lines: PdfLine[]): { seen: number; total: number | null } {
  const seen = new Set<number>();
  let total: number | null = null;
  for (const l of lines) {
    const m = /Page\s+(\d+)\s+of\s+(\d+)/i.exec(l.text);
    if (m) { seen.add(Number(m[1])); total = Math.max(total ?? 0, Number(m[2])); }
  }
  const pages = new Set(lines.map((l) => l.page));
  return { seen: Math.max(seen.size, pages.size), total };
}

/** Pro Seite: Kopf (bis zur Spaltenüberschrift) und Fuß (ab "Filter"/"Page x of y") abtrennen. */
export function bodyLines(lines: PdfLine[], headerMarker: RegExp): { body: PdfLine[]; header: PdfLine[]; footer: PdfLine[] } {
  const body: PdfLine[] = [], header: PdfLine[] = [], footer: PdfLine[] = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  for (const p of pages) {
    const pl = lines.filter((l) => l.page === p);
    const footAt = pl.findIndex((l) => /^Filter\b/i.test(l.text) || /Page\s+\d+\s+of\s+\d+/i.test(l.text));
    const content = footAt >= 0 ? pl.slice(0, footAt) : pl;
    footer.push(...(footAt >= 0 ? pl.slice(footAt) : []));
    let hdrEnd = content.findIndex((l) => headerMarker.test(l.text));
    if (hdrEnd < 0) hdrEnd = -1;
    // Kopf = alles bis einschließlich der Überschriftszeilen: erste Zeile nach dem Marker,
    // die mit einer Zimmernummer/Gruppenzeile/Datum beginnt, ist schon Inhalt.
    header.push(...content.slice(0, hdrEnd + 1));
    body.push(...content.slice(hdrEnd + 1));
  }
  return { body, header, footer };
}

const DATE_IN_TEXT = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2})/;
/** Filterzeilen („From Date …“, „To Departure Date …“, „Stay From …“) sind keine Druckdaten. */
const FILTER_LINE = /\b(From|To)\b[^\d]*(Date|Departure|Stay)|\b(Stay|Departure)\s+(From|To)\b/i;
const PRINT_LABEL = /(?:printed(?:\s+on)?|print\s*date|run\s*date|report\s*date|druckdatum|gedruckt(?:\s+am)?|erstellt(?:\s+am)?)\s*:?\s*/i;

/**
 * Druckdatum aus dem Kopf. Reihenfolge: (1) Datum hinter einem Label (de/en), (2) erstes Datum
 * (auch „06/10/26 07:06“ in einer Zelle) im Kopf, (3) wie (2) in den ersten Zeilen der ersten Seite,
 * falls der Kopf nicht erkannt wurde. Filterzeilen werden übersprungen. Nichts gefunden → null.
 */
export function findHeaderDateRaw(header: PdfLine[], firstLines: PdfLine[] = []): string | null {
  const pools = [header, firstLines.filter((l) => l.page === (firstLines[0]?.page ?? 1)).slice(0, 12)];
  for (const pool of pools) {
    for (const l of pool) {
      if (FILTER_LINE.test(l.text)) continue;
      const m = new RegExp(PRINT_LABEL.source + DATE_IN_TEXT.source, "i").exec(l.text);
      if (m) return m[1];
    }
  }
  for (const pool of pools) {
    for (const l of pool) {
      if (FILTER_LINE.test(l.text) || ROOM_RE.test(l.segments[0] ?? "")) continue; // Filterzeilen und Datenzeilen sind kein Druckdatum
      for (const s of l.segments) {
        if (DATE_RE.test(s)) return s;
        const m = new RegExp("^" + DATE_IN_TEXT.source + "\\s+\\d{1,2}:\\d{2}").exec(s.trim());
        if (m) return m[1];
      }
    }
  }
  return null;
}

export interface DateCtx {
  res: DateResolution;
  iso: (raw: string) => string | null;
}

/** Löst das Datumsformat für eine ganze Liste auf und meldet Mehrdeutigkeit als CRITICAL. */
export function makeDateCtx(
  raws: string[], issues: ParseIssue[], configured: DateFormatId,
  confirmed?: DateFormatId, weekdays?: (string | null)[], anchor?: { raw: string | null; iso?: string },
): DateCtx {
  const res = resolveDateFormat(raws, { weekdays, confirmed, anchor: anchor?.raw && anchor.iso ? { raw: anchor.raw, iso: anchor.iso } : undefined });
  if (res.via === "reportDate") {
    issues.push(issue("INFO", "DATE_BY_REPORT_DATE", `Datumsformat über das Druckdatum bestätigt (${anchor!.iso} = heute).`));
  }
  if (res.format === null) {
    const r = res.readings!;
    const text = (Object.keys(r) as DateFormatId[])
      .map((f) => `${f === "MDY" ? "MM-TT-JJ" : "TT/MM/JJ"}: ${r[f].min} bis ${r[f].max}`)
      .join(" | ");
    issues.push(issue("CRITICAL", "DATE_AMBIGUOUS",
      `Datumsformat nicht eindeutig. Bitte eine Lesart bestätigen — ${text}.`));
  } else if (res.via !== "confirmed" && res.format !== configured) {
    issues.push(issue("WARNING", "DATE_FORMAT_DIFFERS",
      `Datumsformat weicht vom gespeicherten Layout ab; gelesen als ${res.format === "MDY" ? "MM-TT-JJ" : "TT/MM/JJ"}.`));
  }
  return { res, iso: (raw) => (res.format ? toIso(raw, res.format) : null) };
}
