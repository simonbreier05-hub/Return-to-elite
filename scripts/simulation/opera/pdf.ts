/**
 * Simulation „5 Hoteltage“ — druckt die fünf Opera-Listen eines Tages als PDF (pdf-lib), im Layout des Nachbaus
 * `tests/fixtures/opera/2026-10-28/make_fixtures.py` (gleiche Spalten und x-Positionen), nur erfundene Gäste.
 * Gibt je Liste auch die Rohdaten (JSON) zurück.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import {
  DAYS, INVENTORY, addDays, arrivingOn, departingOn, dmy, forecastLine, stayingOn, tracesOn, typeCode, visibleOn, type Guest, type House,
} from "./haus";

const W = 841.89, H = 595.28;
type Fonts = { n: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont };
type Cell = [string, number];

async function doc() {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date("2026-11-16T04:00:00Z")); pdf.setModificationDate(new Date("2026-11-16T04:00:00Z"));
  const f: Fonts = { n: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold),
    i: await pdf.embedFont(StandardFonts.HelveticaOblique), bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique) };
  return { pdf, f };
}
const text = (p: PDFPage, font: PDFFont, size: number, s: string, x: number, y: number) => { if (s) p.drawText(s, { x, y, size, font }); };
const cols = (p: PDFPage, f: Fonts, y: number, spec: Cell[], size = 7.5) => { for (const [s, x] of spec) text(p, f.n, size, s, x, y); };
const rule = (p: PDFPage, y: number, x0 = 20, x1 = 822) => p.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.5 });
function head(p: PDFPage, f: Fonts, title: string, page: number, total: number, date: string, time: string) {
  text(p, f.i, 10, "HOTEL DE ROME BERLIN", 370, H - 25);
  text(p, f.n, 7.5, dmy(date), 780, H - 25); text(p, f.n, 7.5, time, 780, H - 40);
  text(p, f.bi, 10, title, 380, H - 55);
  text(p, f.i, 7.5, `Page ${page} of ${total}`, 400, 40);
}
const chunk = <T,>(xs: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out.length ? out : [[]]; };

/** „Test 014, Anna Dr. Frau“ — Opera-Schreibweise Nachname, Vorname [Titel] [Anrede]. */
export const operaName = (g: Guest, withSalutation = true) =>
  `${g.last}, ${g.first}${withSalutation && g.title ? ` ${g.title}` : ""}${withSalutation && g.salutation ? ` ${g.salutation}` : ""}`;
const nights = (g: Guest) => Math.round((Date.parse(g.dep) - Date.parse(g.arr)) / 86400000);
const byRoom = (a: Guest, b: Guest) => a.room.localeCompare(b.room);

// ───────── In House ─────────
const IH: Cell[] = [["Room No.", 20], ["Name", 60], ["Company", 160], ["VIP", 240], ["Arr. Date", 270], ["Dep. Date", 320], ["Adl.", 370], ["Chl.", 395],
  ["Rms", 420], ["Nts", 445], ["Room Type", 470], ["Rate Code", 530], ["Res. Status", 590], ["Balance", 660], ["Lang", 700], ["Trc", 730]];
export async function inhousePdf(h: House, d: number) {
  const today = DAYS[d - 1];
  const traced = new Set(tracesOn(h, d).filter((t) => !t.resolved).map((t) => t.room));
  const rows = h.guests.filter((g) => stayingOn(g, today) || arrivingOn(g, today)).sort(byRoom).map((g) => ({
    room: g.room, name: operaName(g), company: g.company, vip: g.vip, arr: g.arr, dep: g.dep, adl: g.adl, chl: g.chl, nts: nights(g),
    roomType: typeCode(g.room), status: g.arr === today ? "RESV" : "CKIN", lang: g.lang, trace: traced.has(g.room),
  }));
  const { pdf, f } = await doc();
  const pages = chunk(rows, 25);
  pages.forEach((part, pi) => {
    const p = pdf.addPage([W, H]);
    head(p, f, "In House Guests", pi + 1, pages.length, today, "05:12");
    let y = H - 85; cols(p, f, y, IH); rule(p, y - 6); y -= 22;
    let floor: string | null = null;
    for (const r of part) {
      if (r.room[0] !== floor) { text(p, f.b, 8, `Etage ${r.room[0]}`, 20, y); y -= 13; floor = r.room[0]; }
      const vals = [r.room, r.name, r.company, r.vip, dmy(r.arr), dmy(r.dep), String(r.adl), String(r.chl), "1", String(r.nts), r.roomType, "RACK", r.status, "598.00", r.lang, r.trace ? "T" : ""];
      cols(p, f, y, vals.map((v, i) => [v, IH[i][1]] as Cell)); y -= 13;
    }
    if (pi === pages.length - 1) {
      text(p, f.b, 7.5, "Total", 250, y - 4);
      cols(p, f, y - 4, [[String(rows.reduce((a, r) => a + r.adl, 0)), 370], [String(rows.reduce((a, r) => a + r.chl, 0)), 395], [String(rows.length), 420]]);
    }
    text(p, f.n, 6.5, `Filter: In House on ${dmy(today)}`, 20, 60);
  });
  return { bytes: await pdf.save(), rows };
}

// ───────── Departures (heute bis +2) ─────────
const DEP: Cell[] = [["Room No.", 20], ["Name", 60], ["Company", 160], ["VIP Code", 240], ["Arr. Date", 290], ["Dep. Date", 340], ["Adl.", 385], ["Chl.", 405], ["Rms", 425],
  ["Nts", 445], ["Room Type", 470], ["Rate Code", 560], ["Res. Status", 605], ["Time", 660], ["Pay Mth", 705], ["Balance", 770]];
export async function departuresPdf(h: House, d: number, opts: { dropDepDate?: boolean } = {}) {
  const today = DAYS[d - 1];
  const groups = [0, 1, 2].map((k) => {
    const day = addDays(today, k);
    return { day, guests: h.guests.filter((g) => visibleOn(g, today) && g.dep === day).sort(byRoom) };
  });
  const row = (g: Guest) => ({
    room: g.room, name: operaName(g), company: g.company, vip: g.vip, arr: g.arr, dep: g.dep, adl: g.adl, chl: g.chl, nts: nights(g), roomType: typeCode(g.room),
    status: g.dep === today ? (g.chkdOnDepDay ? "CHKD" : "DUOT") : g.arr === today ? "RESV" : "CKIN", depTime: g.dep === today ? g.lateDep ?? "" : "",
  });
  type L = { kind: "group"; day: string } | { kind: "row"; r: ReturnType<typeof row> } | { kind: "total"; gs: Guest[] };
  const lines: L[] = [];
  for (const g of groups) { lines.push({ kind: "group", day: g.day }); for (const x of g.guests) lines.push({ kind: "row", r: row(x) }); lines.push({ kind: "total", gs: g.guests }); }
  const head2 = opts.dropDepDate ? DEP.filter(([s]) => s !== "Dep. Date") : DEP;
  const { pdf, f } = await doc();
  const pages = chunk(lines, 20);
  pages.forEach((part, pi) => {
    const p = pdf.addPage([W, H]);
    head(p, f, "Departures", pi + 1, pages.length, today, d === 2 ? "06:10" : "04:33");
    let y = H - 85; cols(p, f, y, head2); y -= 11; cols(p, f, y, [["Travel Agent", 160]]); y -= 11; cols(p, f, y, [["Group", 160]]); rule(p, y - 6); y -= 22;
    for (const l of part) {
      if (l.kind === "group") { text(p, f.b, 7.5, "Departure", 20, y); text(p, f.b, 7.5, dmy(l.day), 70, y); y -= 13; }
      else if (l.kind === "row") {
        const r = l.r;
        const vals = [r.room, r.name, r.company, r.vip, dmy(r.arr), opts.dropDepDate ? "" : dmy(r.dep), String(r.adl), String(r.chl), "1", String(r.nts), r.roomType, "RACK", r.status, r.depTime, "CA", "598.00"];
        cols(p, f, y, vals.map((v, i) => [v, DEP[i][1]] as Cell)); y -= 13;
      } else {
        text(p, f.b, 7.5, "Total", 250, y - 2);
        cols(p, f, y - 2, [[String(l.gs.reduce((a, g) => a + g.adl, 0)), 385], [String(l.gs.reduce((a, g) => a + g.chl, 0)), 405], [String(l.gs.length), 425], [String(l.gs.reduce((a, g) => a + nights(g), 0)), 445]]);
        y -= 22;
      }
    }
    text(p, f.n, 6.5, `Filter: From Departure Date ${dmy(today)}`, 20, 60); text(p, f.n, 6.5, `To Departure Date ${dmy(addDays(today, 2))}`, 20, 52);
  });
  return { bytes: await pdf.save(), rows: groups.flatMap((g) => g.guests.map(row)) };
}

// ───────── Arrivals: Detailed ─────────
const ARR: Cell[] = [["Room No.", 20], ["Name", 55], ["Company", 160], ["Arr. Date", 255], ["Dep.Date", 305], ["Room Type", 350], ["Adl.", 395], ["Chl.", 415],
  ["Rms.", 435], ["Mkt. Code", 455], ["Src. Code", 495], ["Res. Status", 535], ["Rate Code", 580], ["Currency", 625], ["Rate Amount", 665]];
export async function arrivalsPdf(h: House, d: number) {
  const today = DAYS[d - 1];
  const tr = tracesOn(h, d).filter((t) => !t.resolved && t.date === today);
  const rows = h.guests.filter((g) => arrivingOn(g, today)).sort(byRoom).map((g) => ({
    room: g.room, name: operaName(g), company: g.company, vip: g.vip, arr: g.arr, dep: g.dep, adl: g.adl, chl: g.chl, roomType: typeCode(g.room), status: "RESV",
    arrTime: g.arrTime, trace: tr.find((t) => t.guestId === g.id) ?? null, id: g.id,
  }));
  const { pdf, f } = await doc();
  const pages = chunk(rows, 9);
  pages.forEach((part, pi) => {
    const p = pdf.addPage([W, H]);
    head(p, f, "Arrivals: Detailed", pi + 1, pages.length, today, "05:01");
    let y = H - 85; cols(p, f, y, ARR); y -= 12; cols(p, f, y, [["Conf No.", 55], ["VIP", 175], ["Arr. Time", 255]]); rule(p, y - 6); y -= 24;
    for (const r of part) {
      const vals = [r.room, r.name, r.company, dmy(r.arr), dmy(r.dep), r.roomType, String(r.adl), String(r.chl), "1", "CORP", "GSALE", r.status, "RACK", "EUR", "299.00"];
      cols(p, f, y, vals.map((v, i) => [v, ARR[i][1]] as Cell)); y -= 11;
      cols(p, f, y, [[String(1920000 + r.id), 55], [r.vip, 175], [r.arrTime, 255]]);
      if (r.trace) { y -= 11; text(p, f.n, 7.5, `Traces: ${r.trace.code} ${dmy(r.trace.date)} ${r.trace.text}`, 105, y); }
      y -= 20;
    }
    text(p, f.n, 6.5, `Filter: Stay From Date ${dmy(today)}`, 20, 60); text(p, f.n, 6.5, `Stay To Date ${dmy(today)}`, 20, 52);
  });
  return { bytes: await pdf.save(), rows: rows.map(({ id: _id, trace, ...r }) => (void _id, { ...r, trace: trace ? { code: trace.code, date: trace.date, text: trace.text } : null })) };
}

// ───────── Traces ─────────
const TR: Cell[] = [["Room No.", 30], ["Name", 80], ["Arr. Date", 200], ["Dep. Date", 255], ["Dept.", 310], ["Trace Code", 345], ["Trace Date", 405], ["Trace Text", 465], ["Resolved", 770]];
export function traceRows(h: House, d: number) {
  const byId = new Map(h.guests.map((g) => [g.id, g]));
  return tracesOn(h, d).map((t) => { const g = byId.get(t.guestId)!; return { room: t.room, name: operaName(g, false), arr: g.arr, dep: g.dep, dept: t.dept, code: t.code, date: t.date, text: t.text, resolved: t.resolved }; });
}
export async function tracesPdf(h: House, d: number) {
  const today = DAYS[d - 1];
  const rows = traceRows(h, d);
  const { pdf, f } = await doc();
  const pages = chunk(rows, 20);
  pages.forEach((part, pi) => {
    const p = pdf.addPage([W, H]);
    head(p, f, "Traces", pi + 1, pages.length, today, "04:20");
    let y = H - 85; cols(p, f, y, TR, 8); rule(p, y - 6, 30, 812); y -= 22;
    for (const t of part) {
      const vals = [t.room, t.name, dmy(t.arr), dmy(t.dep), t.dept, t.code, dmy(t.date), t.text, t.resolved ? "Y" : "N"];
      cols(p, f, y, vals.map((v, i) => [v, TR[i][1]] as Cell), 8); y -= 18;
    }
    text(p, f.n, 7, "Filter: Departments All   Resolved All", 30, 55);
  });
  return { bytes: await pdf.save(), rows };
}
/** Traces als CSV; `dropRoom` lässt die Pflichtspalte „Room No.“ weg (Randfall Tag 5). */
export function tracesCsv(h: House, d: number, opts: { dropRoom?: boolean } = {}): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const headRow = [...(opts.dropRoom ? [] : ["Room No."]), "Name", "Dept.", "Trace Code", "Trace Date", "Trace Text", "Resolved"];
  const lines = traceRows(h, d).map((t) => [...(opts.dropRoom ? [] : [t.room]), t.name, t.dept, t.code, dmy(t.date), t.text, t.resolved ? "Y" : "N"].map(q).join(","));
  return [headRow.map(q).join(","), ...lines].join("\r\n") + "\r\n";
}

// ───────── History and Forecast ─────────
const FC1 = ["Total Occ.", "Arr.", "Comp.", "House", "Deduct", "Non-Ded.", "Deduct", "Non-Ded.", "Occ.%", "Room Revenue", "Average Rate", "Dep.", "Day Use", "No Show", "OOO", "Adlt. & Chl."];
const FC2 = ["Rooms", "Rooms", "Rooms", "Use", "Indiv.", "Indiv.", "Group", "Group", "", "", "", "Rooms", "Rooms", "Rooms", "Rooms", "Chl."];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export async function forecastPdf(h: House, d: number) {
  const today = DAYS[d - 1];
  const dates = Array.from({ length: 17 }, (_, i) => addDays(today, i - 3));
  const rows = dates.map((date) => {
    const l = forecastLine(h, d, date);
    return { ...l, occPct: Math.round((l.occ / (INVENTORY - l.ooo)) * 10000) / 100, history: date < today };
  });
  const { pdf, f } = await doc();
  const p = pdf.addPage([W, H]);
  head(p, f, "History and Forecast", 1, 1, today, "07:06");
  const xs = Array.from({ length: 16 }, (_, i) => 80 + i * 47);
  let y = H - 85; text(p, f.n, 6.5, "Date", 20, y); FC1.forEach((s, i) => text(p, f.n, 6.5, s, xs[i], y));
  y -= 9; text(p, f.n, 6.5, "Rooms", 20, y); FC2.forEach((s, i) => text(p, f.n, 6.5, s, xs[i], y));
  rule(p, y - 6); y -= 18;
  const line = (r: (typeof rows)[number]) => {
    const ded = Math.round(r.occ * 0.8), rev = r.occ * 351.2;
    const vals = [String(r.occ), String(r.arr), "1", "0", String(ded), "0", String(Math.max(0, r.occ - ded - 1)), "0", `${r.occPct.toFixed(2)}%`, money(rev), money(rev / Math.max(1, r.occ)),
      String(r.dep), "0", "0", String(r.ooo), String(r.persons)];
    text(p, f.n, 6.5, `${dmy(r.date)} ${WD[new Date(`${r.date}T00:00:00Z`).getUTCDay()]}`, 20, y);
    vals.forEach((v, i) => text(p, f.n, 6.5, v, xs[i], y));
    y -= 11;
  };
  text(p, f.b, 6.5, "History", 20, y); y -= 11;
  rows.filter((r) => r.history).forEach(line);
  text(p, f.b, 6.5, "Forecast", 20, y); y -= 11;
  rows.filter((r) => !r.history).forEach(line);
  text(p, f.n, 6.5, `Filter: From Date ${dmy(dates[0])} To Date ${dmy(dates[dates.length - 1])}`, 20, 60);
  return { bytes: await pdf.save(), rows: rows.map(({ history, ...r }) => ({ ...r, abschnitt: history ? "History" : "Forecast" })) };
}
