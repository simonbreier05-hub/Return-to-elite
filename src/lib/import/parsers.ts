import Papa from "papaparse";
import { diffDays, parseTime, weekdayIndex } from "./dates";
import { DEFAULT_SETTINGS } from "@/lib/domain";
import { DEFAULT_MAPPING, DEPARTURES_MIN_HORIZON_DAYS, FORECAST_OCC_TOLERANCE_PCT, type ImportMappingConfig } from "./mapping";
import { parseGuestName } from "./names";
import {
  DATE_RE, ROOM_RE, bodyLines, findHeaderDateRaw, issue, makeDateCtx, pageInfo, type DateCtx,
} from "./parseCommon";
import type {
  ArrivalRow, DepartureRow, ForecastDayRow, ParseIssue, ParseOptions, ParseResult, PdfLine, TraceEntry, TraceRow,
} from "./types";

const NO_TEXT_MSG = "Foto/Scan wird nicht unterstützt. Bitte PDF- oder Excel-Export aus Opera hochladen.";
const num = (s: string) => (/^-?[\d.,]+$/.test(s) ? Number(s.replace(/,/g, "")) : NaN);
const isInt = (s: string | undefined): s is string => !!s && /^\d+$/.test(s);

function empty<T>(type: ParseResult<T>["type"], issues: ParseIssue[]): ParseResult<T> {
  return {
    type, rows: [], issues, reportDate: null, periodFrom: null, periodTo: null,
    pagesSeen: 0, pagesTotal: null, dates: { format: null, via: "unique" },
  };
}

function tokens(segs: string[]): string[] {
  const t = segs.join(" ").split(/\s+/).filter(Boolean);
  // "12:00" "AM" → "12:00 AM" (Uhrzeit mit Leerzeichen)
  const out: string[] = [];
  for (const x of t) {
    if (/^[AP][MN]?$/i.test(x) && out.length && /\d:\d\d$/.test(out[out.length - 1])) out[out.length - 1] += " " + x;
    else out.push(x);
  }
  return out;
}

function footerRaw(footer: PdfLine[], re: RegExp): string | null {
  for (const l of footer) { const m = re.exec(l.text); if (m) return m[1]; }
  return null;
}

function pageIssues(lines: PdfLine[], issues: ParseIssue[]) {
  const { seen, total } = pageInfo(lines);
  if (total !== null && seen < total) {
    issues.push(issue("WARNING", "PAGE_MISSING",
      `Liste unvollständig: ${seen} von ${total} Seiten gelesen. Bitte alle Seiten exportieren.`));
  }
  return { seen, total };
}

// ───────────────────────────── Departures ─────────────────────────────

export function parseDepartures(
  lines: PdfLine[], opts: ParseOptions = {}, cfg: ImportMappingConfig = DEFAULT_MAPPING,
): ParseResult<DepartureRow> {
  const issues: ParseIssue[] = [];
  if (!lines.length) return empty("DEPARTURES", [issue("CRITICAL", "NO_TEXT", NO_TEXT_MSG)]);
  const { body, header, footer } = bodyLines(lines, /^Group$/);
  const { seen, total } = pageIssues(lines, issues);

  type Raw = { room: string; name: string; arr: string; dep: string; adl: number; chl: number; nts: number;
    status: string | null; time: string | null; vip: boolean; group: string | null; line: PdfLine };
  const raws: Raw[] = [];
  let group: string | null = null;
  let sums = { adl: 0, chl: 0, rms: 0, nts: 0 };
  const vipRe = new RegExp(cfg.vipPattern, "i");

  for (const l of body) {
    const s = l.segments;
    if (s[0] === "Departure" && s[1] && DATE_RE.test(s[1])) { group = s[1]; sums = { adl: 0, chl: 0, rms: 0, nts: 0 }; continue; }
    if (s[0] === "Total") {
      const t = tokens(s.slice(1)).map(num);
      if (t.length >= 4 && [sums.adl, sums.chl, sums.rms, sums.nts].some((v, i) => v !== t[i])) {
        issues.push(issue("WARNING", "TOTAL_MISMATCH", "Summenzeile einer Abreise-Gruppe passt nicht zu den gelesenen Zeilen — Seite prüfen.", { page: l.page }));
      }
      continue;
    }
    if (!ROOM_RE.test(s[0] ?? "")) continue;
    const di = s.map((x, i) => (DATE_RE.test(x) ? i : -1)).filter((i) => i >= 0);
    if (di.length < 2) { issues.push(issue("CRITICAL", "ROW_UNREADABLE", "Zeile ohne zwei Datumswerte.", { room: s[0], page: l.page })); continue; }
    const t = tokens(s.slice(di[1] + 1));
    const ntsM = /^(\d+)([A-Z]+)?$/.exec(t[3] ?? "");
    if (!isInt(t[0]) || !isInt(t[1]) || !isInt(t[2]) || !ntsM) {
      issues.push(issue("CRITICAL", "ROW_UNREADABLE", "Personen/Nächte nicht lesbar.", { room: s[0], page: l.page })); continue;
    }
    const status = t.slice(4).find((x) => cfg.statusCodes.includes(x)) ?? null;
    const time = t.slice(4).map((x) => (/^\d{1,2}:\d{2}/.test(x) ? parseTime(x) : null)).find(Boolean) ?? null;
    const vip = s.slice(2, di[0]).some((x) => vipRe.test(x));
    const adl = Number(t[0]), chl = Number(t[1]), rms = Number(t[2]);
    sums = { adl: sums.adl + adl, chl: sums.chl + chl, rms: sums.rms + rms, nts: sums.nts + Number(ntsM[1]) };
    raws.push({ room: s[0], name: s[1], arr: s[di[0]], dep: s[di[1]], adl, chl, nts: Number(ntsM[1]),
      status, time, vip, group, line: l });
  }

  const fromRaw = footerRaw(footer, /From Departure Date\s+(\S+)/i);
  const toRaw = footerRaw(footer, /To Departure Date\s+(\S+)/i);
  const hdrRaw = findHeaderDateRaw(header);
  const allRaw = [...raws.flatMap((r) => [r.arr, r.dep, ...(r.group ? [r.group] : [])]),
    ...[fromRaw, toRaw, hdrRaw].filter((x): x is string => !!x)];
  const ctx: DateCtx = makeDateCtx(allRaw, issues, cfg.dateFormat, opts.confirmedDateFormat);

  const rows: DepartureRow[] = [];
  if (ctx.res.format) {
    for (const r of raws) {
      const arrDate = ctx.iso(r.arr), depDate = ctx.iso(r.dep);
      if (!arrDate || !depDate) { issues.push(issue("CRITICAL", "ROW_UNREADABLE", "Datum nicht lesbar.", { room: r.room, page: r.line.page })); continue; }
      if (r.group && ctx.iso(r.group) !== depDate) {
        issues.push(issue("WARNING", "GROUP_DATE_MISMATCH", "Abreisedatum weicht von der Gruppenzeile ab.", { room: r.room, page: r.line.page }));
      }
      rows.push({ room: r.room, guest: parseGuestName(r.name, cfg), arrDate, depDate, adults: r.adl, children: r.chl,
        nights: r.nts, status: r.status, depTime: r.time, vip: r.vip });
    }
  }
  const dup = rows.length - new Set(rows.map((r) => `${r.room}|${r.arrDate}`)).size;
  if (dup > 0) issues.push(issue("WARNING", "DUPLICATE_ROWS", `${dup} doppelte Zeile(n) (Zimmer + Anreise).`));

  const reportDate = hdrRaw ? ctx.iso(hdrRaw) : null;
  const periodFrom = fromRaw ? ctx.iso(fromRaw) : null;
  const periodTo = toRaw ? ctx.iso(toRaw) : null;
  const today = opts.today ?? reportDate;
  if (periodTo && today && diffDays(today, periodTo) < DEPARTURES_MIN_HORIZON_DAYS) {
    issues.push(issue("WARNING", "PERIOD_SHORT",
      `Zeitraum endet ${periodTo}: weniger als ${DEPARTURES_MIN_HORIZON_DAYS} Tage ab heute. Längere Aufenthalte fehlen (Bleiber unvollständig). Bitte heute bis +${DEPARTURES_MIN_HORIZON_DAYS} Tage exportieren.`));
  }
  if (!periodTo) issues.push(issue("WARNING", "PERIOD_UNKNOWN", "Exportzeitraum nicht im Fuß der Liste gefunden."));
  return { type: "DEPARTURES", rows, issues, reportDate, periodFrom, periodTo, pagesSeen: seen, pagesTotal: total, dates: ctx.res };
}

// ───────────────────────────── Arrivals ─────────────────────────────

export function parseArrivals(
  lines: PdfLine[], opts: ParseOptions = {}, cfg: ImportMappingConfig = DEFAULT_MAPPING,
): ParseResult<ArrivalRow> {
  const issues: ParseIssue[] = [];
  if (!lines.length) return empty("ARRIVALS", [issue("CRITICAL", "NO_TEXT", NO_TEXT_MSG)]);
  const { body, header, footer } = bodyLines(lines, /^Conf No\./);
  const { seen, total } = pageIssues(lines, issues);
  const vipRe = new RegExp(cfg.vipPattern, "i");
  const traceRe = /^Traces:\s*(\S+)\s+(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s+(.*)$/;

  type Raw = { room: string; name: string; arr: string; dep: string; adl: number; chl: number; status: string | null;
    time: string | null; vip: boolean; traces: { code: string; date: string; text: string }[]; page: number };
  const raws: Raw[] = [];
  let cur: Raw | null = null;

  for (const l of body) {
    const s = l.segments;
    const di = s.map((x, i) => (DATE_RE.test(x) ? i : -1)).filter((i) => i >= 0);
    if (ROOM_RE.test(s[0] ?? "") && di.length >= 2) {
      const t = tokens(s.slice(di[1] + 1));
      if (!isInt(t[1]) || !isInt(t[2])) {
        issues.push(issue("CRITICAL", "ROW_UNREADABLE", "Personen nicht lesbar.", { room: s[0], page: l.page })); cur = null; continue;
      }
      cur = { room: s[0], name: s[1], arr: s[di[0]], dep: s[di[1]], adl: Number(t[1]), chl: Number(t[2]),
        status: t.slice(4).find((x) => cfg.statusCodes.includes(x)) ?? null, time: null, vip: false, traces: [], page: l.page };
      raws.push(cur);
      continue;
    }
    if (!cur) continue;
    if (/^Fixed Charges:/i.test(l.text) || /^Inventory Items:/i.test(l.text)) continue; // Beträge/Inventar: verwerfen
    const tm = traceRe.exec(l.text);
    if (tm) { cur.traces.push({ code: tm[1], date: tm[2], text: tm[3].trim() }); continue; }
    if (!cur.time) {
      const seg = s.find((x) => /^\*?\d{1,2}:\d{2}/.test(x));
      if (seg) cur.time = parseTime(seg);
    }
    if (s.some((x) => vipRe.test(x))) cur.vip = true;
  }

  const fromRaw = footerRaw(footer, /Stay From Date\s+(\S+)/i);
  const toRaw = footerRaw(footer, /Stay To Date\s+(\S+)/i);
  const hdrRaw = findHeaderDateRaw(header);
  const allRaw = [...raws.flatMap((r) => [r.arr, r.dep, ...r.traces.map((t) => t.date)]),
    ...[fromRaw, toRaw, hdrRaw].filter((x): x is string => !!x)];
  const ctx = makeDateCtx(allRaw, issues, cfg.dateFormat, opts.confirmedDateFormat);

  const rows: ArrivalRow[] = [];
  if (ctx.res.format) {
    for (const r of raws) {
      const arrDate = ctx.iso(r.arr), depDate = ctx.iso(r.dep);
      if (!arrDate || !depDate) { issues.push(issue("CRITICAL", "ROW_UNREADABLE", "Datum nicht lesbar.", { room: r.room, page: r.page })); continue; }
      const traces: TraceEntry[] = r.traces.map((t) => ({ code: t.code, date: ctx.iso(t.date) ?? arrDate, text: t.text }));
      if (!r.time) issues.push(issue("INFO", "NO_ARRIVAL_TIME", "Keine Anreisezeit gelesen.", { room: r.room, page: r.page }));
      rows.push({ room: r.room, guest: parseGuestName(r.name, cfg), arrDate, depDate, arrTime: r.time,
        adults: r.adl, children: r.chl, status: r.status, vip: r.vip, traces });
    }
  }
  const noSal = rows.filter((r) => !r.guest.salutation).length;
  if (noSal) issues.push(issue("WARNING", "NO_SALUTATION", `${noSal} Gast/Gäste ohne erkennbare Anrede.`));
  const dup = rows.length - new Set(rows.map((r) => `${r.room}|${r.arrDate}`)).size;
  if (dup > 0) issues.push(issue("WARNING", "DUPLICATE_ROWS", `${dup} doppelte Zeile(n) (Zimmer + Anreise).`));

  const reportDate = hdrRaw ? ctx.iso(hdrRaw) : null;
  const periodFrom = fromRaw ? ctx.iso(fromRaw) : null;
  const periodTo = toRaw ? ctx.iso(toRaw) : null;
  if (reportDate && periodFrom && reportDate !== periodFrom) {
    issues.push(issue("INFO", "REPORT_DATE_DIFFERS", `Druckdatum ${reportDate}, Liste gilt für Anreisen am ${periodFrom}. Geschäftsdatum = ${periodFrom}.`));
  }
  return { type: "ARRIVALS", rows, issues, reportDate, periodFrom, periodTo, pagesSeen: seen, pagesTotal: total, dates: ctx.res };
}

/** Gegenprobe: Departures mit Anreise am Arrivals-Tag, die in den Arrivals fehlen → Arrivals unvollständig? */
export function crossCheckArrivals(arrivals: ParseResult<ArrivalRow>, departures: ParseResult<DepartureRow>): ParseIssue[] {
  const day = arrivals.periodFrom;
  if (!day) return [];
  const have = new Set(arrivals.rows.map((r) => r.room));
  const missing = departures.rows.filter((d) => d.arrDate === day && !have.has(d.room)).map((d) => d.room);
  if (!missing.length) return [];
  return [issue("WARNING", "ARRIVALS_INCOMPLETE",
    `${missing.length} Zimmer (${missing.sort().join(", ")}) reisen laut Departures am ${day} an, fehlen aber in den Arrivals — Liste vermutlich unvollständig.`)];
}

// ───────────────────────────── Forecast ─────────────────────────────

export function parseForecast(
  lines: PdfLine[], opts: ParseOptions = {}, cfg: ImportMappingConfig = DEFAULT_MAPPING,
): ParseResult<ForecastDayRow> {
  const issues: ParseIssue[] = [];
  if (!lines.length) return empty("FORECAST", [issue("CRITICAL", "NO_TEXT", NO_TEXT_MSG)]);
  const { body, header } = bodyLines(lines, /^Rooms\b/);
  const { seen, total } = pageIssues(lines, issues);
  const hdrText = lines.slice(0, 12).map((l) => l.text).join(" ");
  for (const kw of ["Occ", "Revenue", "Average", "OOO"]) {
    if (!hdrText.includes(kw)) issues.push(issue("WARNING", "HEADER_UNEXPECTED", `Spaltenüberschrift „${kw}" nicht gefunden — Layout geprüft?`));
  }

  const cols = cfg.forecastColumns;
  type Raw = { date: string; wd: string; v: Record<string, number>; line: PdfLine };
  const raws: Raw[] = [];
  for (const l of body) {
    const m = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(?:\s+([A-Za-z]{2,3}))?$/.exec(l.segments[0] ?? "");
    if (!m) continue; // History/Forecast/Subtotal/Total-Zeilen
    const wd = m[2] ?? l.segments[1] ?? "";
    const rest = tokens(m[2] ? l.segments.slice(1) : l.segments.slice(2)).map((x) => num(x.replace("%", "")));
    if (rest.length !== cols.length || rest.some(Number.isNaN)) {
      issues.push(issue("WARNING", "ROW_UNREADABLE", `Forecast-Zeile vom ${m[1]} hat ${rest.length} statt ${cols.length} Werten.`, { page: l.page })); continue;
    }
    raws.push({ date: m[1], wd, v: Object.fromEntries(cols.map((c, i) => [c, rest[i]])), line: l });
  }

  const hdrRaw = findHeaderDateRaw(header);
  const ctx = makeDateCtx([...raws.map((r) => r.date), ...(hdrRaw ? [hdrRaw] : [])], issues, "DMY", opts.confirmedDateFormat,
    [...raws.map((r) => (weekdayIndex(r.wd) !== null ? r.wd : null)), ...(hdrRaw ? [null] : [])]);
  const reportDate = hdrRaw ? ctx.iso(hdrRaw) : null;
  const today = opts.today ?? reportDate;
  const inventory = opts.roomInventory ?? DEFAULT_SETTINGS.roomInventory;

  const rows: ForecastDayRow[] = [];
  if (ctx.res.format) {
    if (!today) issues.push(issue("CRITICAL", "TODAY_UNKNOWN", "Druckdatum nicht lesbar — heutiger Tag unbekannt."));
    for (const r of raws) {
      const date = ctx.iso(r.date);
      if (!date || !today || date < today) continue; // History verwerfen
      const expected = (r.v.totalOcc / Math.max(1, inventory - r.v.ooo)) * 100;
      if (Math.abs(expected - r.v.occPct) > FORECAST_OCC_TOLERANCE_PCT) {
        issues.push(issue("WARNING", "OCC_IMPLAUSIBLE",
          `${date}: Auslastung ${r.v.occPct}% passt nicht zu ${r.v.totalOcc} belegten Zimmern (erwartet ≈ ${expected.toFixed(1)}% bei ${inventory} Zimmern).`));
      }
      // Umsatz (roomRevenue) und Durchschnittspreis (averageRate) werden hier bewusst NICHT übernommen.
      rows.push({ date, occupiedRooms: r.v.totalOcc, arrivals: r.v.arrRooms, departures: r.v.depRooms, occupancyPct: r.v.occPct,
        outOfOrder: r.v.ooo, dayUse: r.v.dayUse, noShow: r.v.noShow, persons: r.v.persons });
    }
    if (today && !rows.length) issues.push(issue("CRITICAL", "NO_FUTURE_DAYS", "Keine Tage ab heute in der Liste."));
  }
  const dates = rows.map((r) => r.date).sort();
  return { type: "FORECAST", rows, issues, reportDate, periodFrom: dates[0] ?? null, periodTo: dates[dates.length - 1] ?? null,
    pagesSeen: seen, pagesTotal: total, dates: ctx.res };
}

// ───────────────────────────── Traces ─────────────────────────────

const TRACE_HEADER_ALIASES: Record<string, string[]> = {
  room: ["room no.", "room", "zimmer"],
  name: ["name", "gast"],
  dept: ["dept.", "dept", "department", "abteilung"],
  code: ["trace code", "code"],
  date: ["trace date", "date", "datum"],
  text: ["trace text", "text", "trace"],
  resolved: ["resolved", "erledigt"],
};

function finishTraces(
  raw: { room: string; name: string; dept: string; code: string; date: string; text: string; resolved: boolean }[],
  issues: ParseIssue[], opts: ParseOptions, cfg: ImportMappingConfig, reportDateRaw: string | null,
  seen: number, total: number | null,
): ParseResult<TraceRow> {
  const open = raw.filter((r) => !r.resolved);
  if (raw.length > open.length) issues.push(issue("INFO", "RESOLVED_SKIPPED", `${raw.length - open.length} erledigte Trace(s) übersprungen.`));
  const ctx = makeDateCtx([...open.map((r) => r.date), ...(reportDateRaw ? [reportDateRaw] : [])], issues, cfg.dateFormat, opts.confirmedDateFormat);
  const rows: TraceRow[] = ctx.res.format
    ? open.flatMap((r) => {
        const date = ctx.iso(r.date);
        if (!date) { issues.push(issue("WARNING", "ROW_UNREADABLE", "Trace-Datum nicht lesbar.", { room: r.room })); return []; }
        return [{ room: r.room, guest: r.name ? parseGuestName(r.name, cfg) : null, code: r.code, dept: r.dept || null, date, text: r.text }];
      })
    : [];
  const dup = rows.length - new Set(rows.map((r) => `${r.room}|${r.code}|${r.date}|${r.text}`)).size;
  if (dup > 0) issues.push(issue("WARNING", "DUPLICATE_ROWS", `${dup} doppelte Trace(s) (Zimmer, Code, Datum, Text).`));
  return { type: "TRACES", rows, issues, reportDate: reportDateRaw ? ctx.iso(reportDateRaw) : null, periodFrom: null, periodTo: null,
    pagesSeen: seen, pagesTotal: total, dates: ctx.res };
}

export function parseTracesPdf(lines: PdfLine[], opts: ParseOptions = {}, cfg: ImportMappingConfig = DEFAULT_MAPPING): ParseResult<TraceRow> {
  const issues: ParseIssue[] = [];
  if (!lines.length) return empty("TRACES", [issue("CRITICAL", "NO_TEXT", NO_TEXT_MSG)]);
  const { body, header } = bodyLines(lines, /Trace Text/);
  const { seen, total } = pageIssues(lines, issues);
  const raw: Parameters<typeof finishTraces>[0] = [];
  for (const l of body) {
    const s = l.segments;
    const di = s.map((x, i) => (DATE_RE.test(x) ? i : -1)).filter((i) => i >= 0);
    if (!ROOM_RE.test(s[0] ?? "") || di.length < 3) continue;
    raw.push({ room: s[0], name: s[1], dept: s[di[1] + 1] ?? "", code: s[di[1] + 2] ?? "", date: s[di[2]],
      text: s.slice(di[2] + 1, -1).join(" "), resolved: /^(Y|J|X)$/i.test(s[s.length - 1]) });
  }
  return finishTraces(raw, issues, opts, cfg, findHeaderDateRaw(header), seen, total);
}

/** UTF-8, sonst Windows-1252 (typisch für Excel-CSV). */
export function decodeText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

export function parseTracesCsv(text: string, opts: ParseOptions = {}, cfg: ImportMappingConfig = DEFAULT_MAPPING): ParseResult<TraceRow> {
  const issues: ParseIssue[] = [];
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: true });
  const [head, ...data] = parsed.data;
  if (!head) return empty("TRACES", [issue("CRITICAL", "NO_DATA", "Datei ist leer.")]);
  const idx: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(TRACE_HEADER_ALIASES)) {
    const i = head.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
    if (i >= 0) idx[key] = i;
  }
  for (const req of ["room", "date", "text"]) {
    if (idx[req] === undefined) issues.push(issue("CRITICAL", "COLUMN_MISSING", `Pflichtspalte „${req}" nicht gefunden.`));
  }
  if (issues.length) return empty("TRACES", issues);
  const get = (r: string[], k: string) => (idx[k] !== undefined ? (r[idx[k]] ?? "").trim() : "");
  const raw = data.filter((r) => ROOM_RE.test(get(r, "room"))).map((r) => ({
    room: get(r, "room"), name: get(r, "name"), dept: get(r, "dept"), code: get(r, "code"),
    date: get(r, "date"), text: get(r, "text"), resolved: /^(Y|J|X|1)$/i.test(get(r, "resolved")),
  }));
  return finishTraces(raw, issues, opts, cfg, null, 1, 1);
}
