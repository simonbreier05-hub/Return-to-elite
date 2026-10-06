import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Scenario, SampleGuest } from "./scenario";

/** Kleiner Zeichner: eine Zelle = ein Text-Item im PDF (wie bei Opera/BI Publisher). */
class Canvas {
  page!: PDFPage;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont, private italic: PDFFont,
    private size: [number, number]) {}
  newPage() { this.page = this.doc.addPage(this.size); return this.page; }
  t(text: string, x: number, y: number, o: { b?: boolean; i?: boolean; s?: number } = {}) {
    if (!text) return;
    this.page.drawText(text, { x, y, size: o.s ?? 7.5, font: o.b ? this.bold : o.i ? this.italic : this.font, color: rgb(0, 0, 0) });
  }
  width(text: string, s = 7.5) { return this.font.widthOfTextAtSize(text, s); }
  line(y: number, x1 = 20, x2 = 822) { this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5 }); }
}

async function canvas(size: [number, number]) {
  const doc = await PDFDocument.create();
  const c = new Canvas(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold),
    await doc.embedFont(StandardFonts.HelveticaOblique), size);
  return { doc, c };
}
const A4L: [number, number] = [842, 595];

// ───────────────────────── Arrivals: Detailed ─────────────────────────

export async function buildArrivalsPdf(
  sc: Scenario, opts: { onlyFirstPage?: boolean; arrivals?: SampleGuest[]; page1Count?: number; listDay?: string; reportDate?: string } = {},
) {
  const { doc, c } = await canvas(A4L);
  const all = opts.arrivals ?? sc.arrivals;
  const n = opts.page1Count ?? sc.arrivalsPage1Count;
  const pages = [all.slice(0, n), all.slice(n)].filter((p) => p.length);
  const listDay = opts.listDay ?? sc.listDay;
  const total = opts.onlyFirstPage ? 2 : pages.length;
  for (const [pi, list] of pages.entries()) {
    if (opts.onlyFirstPage && pi > 0) break;
    c.newPage();
    c.t("OPERA DEMO HOTEL", 370, 570, { i: true, s: 10 }); c.t(opts.reportDate ?? sc.reportDate, 780, 570); c.t(sc.reportTime, 780, 555);
    c.t("Arrivals: Detailed", 380, 540, { b: true, i: true, s: 10 });
    let y = 505;
    for (const [t, x] of [["Room No.", 20], ["Name", 55], ["Company", 150], ["Arr. Date", 255], ["Dep.Date", 305], ["Room Type", 350], ["Adl.", 395], ["Chl.", 415],
      ["Rms.", 435], ["Mkt. Code", 455], ["Src. Code", 495], ["Res. Status", 535], ["Rate Code", 580], ["Currency", 625], ["Rate Amount", 665], ["Pay Mth.", 715], ["Deposit Received", 755]] as const) c.t(t, x, y);
    y -= 12;
    for (const [t, x] of [["Conf No.", 55], ["VIP", 175], ["Arr. Time", 255], ["Carr. Code", 305], ["Packages", 540], ["Credit Card No.", 665]] as const) c.t(t, x, y);
    c.line(y - 8);
    y -= 28;
    for (const g of list) {
      c.t(g.room, 20, y); c.t(g.name, 55, y); if (g.company) c.t(g.company, 150, y);
      c.t(g.arr, 255, y); c.t(g.dep, 305, y); c.t(g.type, 350, y); c.t(String(g.adl), 397, y); c.t(String(g.chl), 417, y); c.t("1", 437, y);
      c.t("CORP", 455, y); c.t("GSALE", 495, y); c.t(g.status, 535, y); c.t(g.rateCode, 580, y); c.t("USD", 625, y); c.t(g.rate, 665, y); c.t("CA", 715, y); c.t("0.00", 760, y);
      y -= 11;
      c.t(g.conf, 55, y); if (g.vip) c.t("V1", 175, y); c.t(g.time, 255, y); c.t(g.card, 665, y);
      if (g.fixedCharge) { y -= 11; c.t("Fixed Charges: " + g.fixedCharge, 100, y); }
      for (const tr of g.traces ?? []) { y -= 11; c.t(`Traces: ${tr.code} ${tr.date} ${tr.text}`, 105, y); }
      if (g.inventory) { y -= 11; c.t("Inventory Items: " + g.inventory, 100, y); }
      y -= 22;
    }
    c.t(`Filter: Stay From Date ${listDay}`, 20, 60, { s: 6.5 });
    c.t(`Stay To Date ${listDay}`, 20, 52, { s: 6.5 });
    c.t(`Page ${pi + 1} of ${total}`, 400, 40, { i: true });
    c.t("res_detail", 780, 40, { i: true });
  }
  return doc.save();
}

// ───────────────────────── Departures ─────────────────────────

export async function buildDeparturesPdf(
  sc: Scenario, opts: { to?: string; groups?: Scenario["departureGroups"]; breakTotals?: boolean; reportDate?: string } = {},
) {
  const { doc, c } = await canvas(A4L);
  c.newPage();
  c.t("OPERA DEMO HOTEL", 380, 570, { i: true, s: 10 }); c.t(opts.reportDate ?? sc.reportDate, 780, 570); c.t("04:33 AM", 780, 555);
  c.t("Departures", 395, 540, { b: true, i: true, s: 10 });
  let y = 505;
  for (const [t, x] of [["Room No.", 20], ["Name", 60], ["Company", 150], ["VIP Code", 235], ["Arr. Date", 290], ["Dep. Date", 340], ["Adl.", 385], ["Chl.", 405], ["Rms", 425],
    ["Nts", 445], ["Room Type", 462], ["Block Code", 520], ["Rate Code", 560], ["Res. Status", 605], ["Dep. Time", 655], ["Pay Mth", 705], ["Balance", 770]] as const) c.t(t, x, y);
  y -= 11; c.t("Travel Agent", 150, y); y -= 11; c.t("Group", 150, y); c.line(y - 8); y -= 26;
  for (const grp of opts.groups ?? sc.departureGroups) {
    c.t("Departure", 20, y, { b: true }); c.t(grp.date, 70, y, { b: true }); y -= 13;
    const sum = { adl: 0, chl: 0, rms: 0, nts: 0, bal: 0 };
    for (const g of grp.guests) {
      c.t(g.room, 20, y); c.t(g.name, 60, y); if (g.company) c.t(g.company, 150, y); if (g.vip) c.t("V1", 238, y);
      c.t(g.arr, 290, y); c.t(g.dep, 340, y); c.t(String(g.adl), 387, y); c.t(String(g.chl), 407, y); c.t("1", 427, y);
      if (g.type === "LFAMIL") { c.t(String(g.nts), 447, y); c.t(g.type, 447 + c.width(String(g.nts)) + 0.2, y); } // "4LFAMIL" wie im Ausdruck
      else { c.t(String(g.nts), 447, y); c.t(g.type, 466, y); }
      if (g.rateCode) c.t(g.rateCode, 565, y); c.t("BLK9", 525, y);
      c.t(g.status, 610, y); c.t("CA", 710, y); c.t(g.balance, 770, y);
      sum.adl += g.adl; sum.chl += g.chl; sum.rms += 1; sum.nts += g.nts; sum.bal += Number(g.balance);
      y -= 14;
    }
    c.line(y + 8, 20, 822);
    c.t("Total", 250, y - 2, { b: true });
    const bump = opts.breakTotals ? 1 : 0;
    c.t(String(sum.adl + bump), 387, y - 2); c.t(String(sum.chl), 407, y - 2); c.t(String(sum.rms), 427, y - 2); c.t(String(sum.nts), 447, y - 2);
    c.t(sum.bal.toFixed(2), 770, y - 2);
    y -= 26;
  }
  c.t(`Filter: From Departure Date ${sc.depFrom}`, 20, 60, { s: 6.5 });
  c.t(`To Departure Date ${opts.to ?? sc.depTo}`, 20, 52, { s: 6.5 });
  c.t("Page 1 of 1", 400, 40, { i: true }); c.t("departure_all", 780, 40, { i: true });
  return doc.save();
}

// ───────────────────────── Forecast (History and Forecast) ─────────────────────────

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function forecastDay(sc: Scenario, i: number) {
  const f = sc.forecast;
  const [y, m, dd] = f.startIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd + i));
  const occ = 60 + ((i * 37) % 70), ooo = i % 11 === 3 ? 4 : 3;
  const arr = 20 + ((i * 13) % 40), dep = 15 + ((i * 7) % 35);
  return { d, occ, ooo, arr, dep, pct: Math.round((occ / (f.inventory - ooo)) * 10000) / 100, persons: occ * 2 - (i % 5) };
}
const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildForecastPdf(sc: Scenario, opts: { wrongOccAt?: number; dmyAmbiguousNoWeekday?: boolean } = {}) {
  const { doc, c } = await canvas(A4L);
  c.newPage();
  c.t("Hotel de Rome Berlin", 370, 570, { i: true, s: 10 }); c.t(sc.forecast.printDate, 780, 570); c.t("07:06", 780, 555);
  c.t("History and Forecast", 375, 540, { b: true, i: true, s: 10 });
  const heads = ["Total Occ.", "Arr.", "Comp.", "House", "Deduct", "Non-Ded.", "Deduct", "Non-Ded.", "Occ.%", "Room Revenue", "Average Rate", "Dep.", "Day Use", "No Show", "OOO", "Adlt. & Chl."];
  const heads2 = ["Rooms", "Rooms", "Rooms", "Use", "Indiv.", "Indiv.", "Group", "Group", "", "", "", "Rooms", "Rooms", "Rooms", "Rooms", "Chl."];
  const xs = heads.map((_, i) => 80 + i * 47);
  let y = 505; c.t("Date", 20, y, { s: 6.5 });
  heads.forEach((h, i) => c.t(h, xs[i], y, { s: 6.5 }));
  y -= 9; heads2.forEach((h, i) => c.t(h, xs[i], y, { s: 6.5 })); c.t("Rooms", 20, y, { s: 6.5 });
  c.line(y - 6); y -= 18;
  const row = (label: string, vals: string[], bold = false) => {
    c.t(label, 20, y, { s: 6.5, b: bold }); vals.forEach((v, i) => c.t(v, xs[i], y, { s: 6.5, b: bold })); y -= 11;
  };
  const sum = { occ: 0, rev: 0 };
  const rowFor = (i: number) => {
    const r = forecastDay(sc, i);
    const label = `${String(r.d.getUTCDate()).padStart(2, "0")}/${String(r.d.getUTCMonth() + 1).padStart(2, "0")}/${String(r.d.getUTCFullYear()).slice(2)}${opts.dmyAmbiguousNoWeekday ? "" : " " + WD[r.d.getUTCDay()]}`;
    const pct = i === opts.wrongOccAt ? r.pct + 7 : r.pct;
    const rev = r.occ * (320 + (i % 9) * 11.3);
    sum.occ += r.occ; sum.rev += rev;
    const indiv = Math.round(r.occ * 0.8), grp = r.occ - indiv - 1;
    return [label, [String(r.occ), String(r.arr), "1", "0", String(indiv), "0", String(grp), "0", pct.toFixed(2) + "%", f2(rev), f2(rev / r.occ), String(r.dep), "0", String(i % 3 === 0 ? 1 : 0), String(r.ooo), String(r.persons)]] as const;
  };
  c.t("History", 20, y, { b: true, s: 6.5 }); y -= 11;
  for (let i = 0; i < sc.forecast.historyDays; i++) { const [l, v] = rowFor(i); row(l, [...v]); }
  row("Subtotal", ["639", "251", "7", "0", "615", "0", "24", "0", "64.35%", "247,571.48", "387.44", "241", "0", "7", "22", "953"], true);
  c.t("Forecast", 20, y, { b: true, s: 6.5 }); y -= 11;
  for (let i = sc.forecast.historyDays; i < sc.forecast.days; i++) { const [l, v] = rowFor(i); row(l, [...v]); }
  row("Subtotal", ["2252", "691", "87", "3", "1734", "0", "463", "55", "69.12%", "1,131,269.48", "502.34", "726", "0", "77", "77", "3377"], true);
  row("Total", ["2891", "942", "94", "3", "2349", "0", "487", "55", "68.01%", "1,378,840.96", "476.94", "967", "0", "7", "99", "4330"], true);
  c.t(`Filter: From Date ${sc.forecast.fromLabel} To Date ${sc.forecast.toLabel}`, 20, 60, { s: 6.5 });
  c.t("Page 1 of 1", 400, 40, { i: true }); c.t("history_forecast", 760, 40, { i: true });
  return doc.save();
}

// ───────────────────────── Traces ─────────────────────────

export async function buildTracesPdf(sc: Scenario) {
  const { doc, c } = await canvas(A4L);
  c.newPage();
  c.t("OPERA DEMO HOTEL", 350, 560, { s: 10 }); c.t(sc.reportDate, 790, 560); c.t("04:20 AM", 790, 545);
  c.t("Traces", 395, 535, { i: true, s: 11 });
  const cols = [["room", "Room No.", 30], ["name", "Name", 80], ["arrDate", "Arr. Date", 200], ["depDate", "Dep. Date", 255], ["dept", "Dept.", 310],
    ["code", "Trace Code", 345], ["traceDate", "Trace Date", 405], ["text", "Trace Text", 465], ["resolved", "Resolved", 770]] as const;
  let y = 505;
  for (const [, label, x] of cols) c.t(label, x, y, { s: 8 });
  c.line(y - 8, 30, 812); y -= 26;
  for (const r of sc.traces) {
    for (const [k, , x] of cols) c.t(k === "resolved" ? (r.resolved ? "Y" : "N") : r[k], x, y, { s: 8 });
    y -= 20;
  }
  c.t(`Filter: Trace Date From ${sc.depFrom} To ${sc.depTo}   Departments All   Resolved All`, 30, 50, { s: 8 });
  c.t("Page 1 of 1", 400, 35, { i: true }); c.t("traces_all", 780, 35, { i: true });
  return doc.save();
}
