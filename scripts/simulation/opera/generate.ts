/**
 * Simulation „5 Hoteltage“ — erzeugt die Opera-Listen für Tag 1–5 (PDF + Rohdaten JSON + erwartung.json)
 * und prüft sie sofort mit dem echten Import-Leser der App (keine App-Änderung, nur Lesen).
 *
 *   npx tsx scripts/simulation/opera/generate.ts          schreibt tests/simulation/opera/tag-1 … tag-5
 *   npx tsx scripts/simulation/opera/generate.ts --check  prüft nur (schreibt nichts)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveDayPlan } from "@/lib/dayplan/derive";
import { lateCheckoutFrom } from "@/lib/dayplan/lateCheckout";
import { loadList, parseList } from "@/lib/import/readFile";
import type { ArrivalRow, DepartureRow, ForecastDayRow, InHouseRow, TraceRow } from "@/lib/import/types";
import { DAYS, INVENTORY, LINEN_CYCLE, WEEKDAY_DE, buildHouse, creditOf, dmy, expectDay, floorOf, type DayExpect, type House } from "./haus";
import { arrivalsPdf, departuresPdf, forecastPdf, inhousePdf, operaName, tracesCsv, tracesPdf } from "./pdf";

const OUT = join(process.cwd(), "tests", "simulation", "opera");
const checkOnly = process.argv.includes("--check");
const tag = (iso: string) => dmy(iso).replace(/\//g, "-");

async function read<T>(name: string, bytes: Uint8Array, day: string) {
  const list = await loadList(name, bytes);
  const r = parseList(list.type!, list, { today: day, expectedDate: day, roomInventory: INVENTORY });
  return { type: list.type, rows: r.rows as unknown as T[], issues: r.issues, reportDate: r.reportDate };
}

/** Liest die fünf Listen mit dem App-Parser und vergleicht mit dem Soll. Gibt Abweichungen zurück (leer = alles passt). */
async function verify(files: Record<string, Uint8Array>, e: DayExpect): Promise<string[]> {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`Tag ${e.tag} ${what}: gelesen ${JSON.stringify(got)}, Soll ${JSON.stringify(want)}`); };
  const dep = await read<DepartureRow>("departures.pdf", files.departures, e.date);
  const arr = await read<ArrivalRow>("arrivals.pdf", files.arrivals, e.date);
  const inh = await read<InHouseRow>("inhouse.pdf", files.inhouse, e.date);
  const trc = await read<TraceRow>("traces.pdf", files.traces, e.date);
  const fc = await read<ForecastDayRow>("forecast.pdf", files.forecast, e.date);
  eq("Typen", [dep.type, arr.type, inh.type, trc.type, fc.type], ["DEPARTURES", "ARRIVALS", "INHOUSE", "TRACES", "FORECAST"]);
  const allowed = new Set(["PERIOD_SHORT", "DATE_FORMAT_DIFFERS", "RESOLVED_SKIPPED", "NO_SALUTATION", "DATE_BY_REPORT_DATE"]);
  for (const [n, r] of Object.entries({ dep, arr, inh, trc, fc })) {
    for (const i of r.issues) if (i.severity === "CRITICAL" || !allowed.has(i.code)) bad.push(`Tag ${e.tag} ${n}: Befund ${i.severity} ${i.code} — ${i.message}`);
    eq(`${n} Druckdatum`, r.reportDate, e.date);
  }
  eq("Departures Zeilen", dep.rows.length, e.departuresListe.zeilen);
  eq("In-House Zeilen", [inh.rows.length, inh.rows.filter((r) => r.status === "CKIN").length, inh.rows.filter((r) => r.status === "RESV").length], [e.inhouseListe.zeilen, e.inhouseListe.ckin, e.inhouseListe.resv]);
  eq("Arrivals Zeilen", arr.rows.length, e.anreisen);
  eq("Traces offen", trc.rows.length, e.traces.offen);
  eq("Personen heute Nacht", inh.rows.reduce((a, r) => a + r.adults + r.children, 0), e.personenHeuteNacht);
  const plan = deriveDayPlan({ date: e.date, departures: dep.rows, arrivals: arr.rows, inHouse: inh.rows, linenCycleDays: LINEN_CYCLE });
  for (const i of plan.issues) bad.push(`Tag ${e.tag} Tagesplan: ${i.code} — ${i.message}`);
  const of = (t: string) => plan.rooms.filter((r) => r.cleaningType === t).map((r) => r.room).sort();
  eq("Abreisen", plan.figures.departures, e.abreisen);
  eq("Turns", of("SAME_DAY_TURN"), e.zimmer.turns);
  eq("Anreisen", plan.figures.arrivals, e.anreisen);
  eq("Bleiber", of("STAYOVER"), e.zimmer.bleiber);
  eq("belegt heute Nacht", plan.figures.eveningOccupancy, e.belegtHeuteNacht);
  eq("Wäschewechsel", plan.rooms.filter((r) => r.laundryDue).map((r) => r.room).sort(), e.zimmer.waeschewechsel);
  eq("VIP-Anreisen", arr.rows.filter((r) => r.vip).map((r) => r.room).sort(), e.zimmer.vipAnreisen);
  eq("Late Check-out im Report", dep.rows.filter((r) => r.depDate === e.date && lateCheckoutFrom(r.depTime, 660)).map((r) => r.room).sort(), e.zimmer.lateCheckoutImReport);
  eq("ausgecheckt im Report", dep.rows.filter((r) => r.depDate === e.date && r.status === "CHKD").map((r) => r.room).sort(), e.zimmer.ausgechecktImReport);
  const f0 = fc.rows.find((r) => r.date === e.date);
  eq("Forecast heute", f0 && [f0.occupiedRooms, f0.arrivals, f0.departures], [e.belegtHeuteNacht, e.anreisen, e.abreisen]);
  return bad;
}

function overview(h: House, es: DayExpect[]): string {
  const row = (label: string, f: (e: DayExpect) => string | number) => `| ${label} | ${es.map(f).join(" | ")} |`;
  return [
    "# Opera-Listen für die Simulation „5 Hoteltage“",
    "",
    "Erzeugt mit `npx tsx scripts/simulation/opera/generate.ts` (prüfen ohne Schreiben: `--check`). **Alle Gäste sind erfunden** („Test NNN“).",
    "Layout wie der Nachbau `tests/fixtures/opera/2026-10-28/`. Die App verlangt **fünf** Listen je Tag (Forecast, Departures, Arrivals, Traces, In House).",
    "Je Tag: fünf PDFs, dazu je Liste die Rohdaten als JSON und `erwartung.json` (Soll-Zahlen für Import und Planung). `haus.json` = der ganze Bestand.",
    "",
    `| | ${es.map((e) => `Tag ${e.tag} (${e.wochentag} ${dmy(e.date)})`).join(" | ")} |`,
    `|---|${es.map(() => "---").join("|")}|`,
    row("Drehbuch", (e) => ["Normal", "Spitze", "Engpass", "Ruhig", "Randfälle"][e.tag - 1]),
    row("Abreisen (davon Turns)", (e) => `${e.abreisen} (${e.davonTurns})`),
    row("Anreisen", (e) => e.anreisen),
    row("Bleiber", (e) => e.bleiber),
    row("zu reinigen (Abreisen + Bleiber)", (e) => e.zuReinigen),
    row("belegt heute Nacht / Auslastung", (e) => `${e.belegtHeuteNacht} / ${e.auslastungPct.toFixed(1)} %`),
    row("Wäschewechsel fällig (davon Tag-1-Gäste)", (e) => `${e.waeschewechsel} (${e.zimmer.tag1LangbleiberWaesche.length})`),
    row("VIP-Anreisen (davon Etage 5)", (e) => `${e.vipAnreisen} (${e.vipAnreisenEtage5})`),
    row("Suiten-Abreisen ≥ 1,5 Credits (davon ≥ 1,75)", (e) => `${e.suitenAbreisen} (${e.grosseSuitenAbreisen})`),
    row("Allergiker-Zimmer-Abreisen (218/219)", (e) => e.allergikerAbreisen),
    row("Late Check-out im Report / schon ausgecheckt", (e) => `${e.lateCheckoutImReport} / ${e.ausgechecktImReport}`),
    row("Traces: Zeilen / offen", (e) => `${e.traces.zeilen} / ${e.traces.offen}`),
    row("… offen Hausmann / HK / FO / Technik", (e) => ["HOUSEMAN", "HOUSEKEEPING", "FRONT_OFFICE", "ENGINEERING"].map((k) => e.traces.offenJeAbteilung[k] ?? 0).join(" / ")),
    "",
    "## Was nicht in den Listen steht (passiert im Tagesverlauf von Hand)",
    "",
    `- **Tag 2:** Front Office meldet 5 zusätzliche Check-outs (${(es[1].manuellImTagesverlauf.zusaetzlicheCheckouts as string[]).join(", ")}) und 2 Late Check-outs (${h.day2ManualLate.join(", ")}) — kein Nachimport.`,
    "- **Tag 3:** Die 5 vorzeitig Abgereisten fehlen in den Listen. Wäschewechsel der Tag-1-Gäste ist **noch nicht** fällig (erst Tag 4).",
    `- **Tag 4:** Wäschewechsel der ${h.tag1LongStayers.length} Tag-1-Langbleiber fällig; Zimmer ${h.greenOptionDay4} wählt die Green Option.`,
    `- **Tag 5:** Zimmer ${h.oooDay5.join(" und ")} außer Betrieb (Forecast OOO = 2); Zimmerwechsel ${h.roomMoveDay5.from} → ${h.roomMoveDay5.to}; fehlerhafte Dateien in \`tag-5/randfaelle/\`.`,
    "- Es gibt im Haus nur zwei Allergiker-Zimmer (218, 219); beide reisen an Tag 3 ab.",
    "- Die Spalte „Lang“ (Gastsprache) steht nur in der In-House-Liste; die App liest sie bisher nicht (Regel B12 — wird in der Simulation geprüft).",
    "",
  ].join("\n");
}

async function main() {
  const h = buildHouse();
  const es: DayExpect[] = [];
  const problems: string[] = [];
  const write = (dir: string, name: string, data: Uint8Array | string) => { if (checkOnly) return; mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), data); };
  const json = (x: unknown) => JSON.stringify(x, null, 1) + "\n";
  let prevArrivals: Uint8Array | null = null;

  for (let d = 1; d <= 5; d++) {
    const day = DAYS[d - 1], dir = join(OUT, `tag-${d}`), t = tag(day);
    const e = expectDay(h, d);
    const lists = { forecast: await forecastPdf(h, d), departures: await departuresPdf(h, d), arrivals: await arrivalsPdf(h, d), traces: await tracesPdf(h, d), inhouse: await inhousePdf(h, d) };
    for (const [name, l] of Object.entries(lists)) { write(dir, `${name}_${t}.pdf`, l.bytes); write(dir, `${name}_${t}.json`, json({ liste: name, tag: d, datum: day, zeilen: l.rows })); }
    problems.push(...(await verify(Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.bytes])), e)));

    if (d === 5) {
      const rf = join(dir, "randfaelle");
      const broken = await departuresPdf(h, d, { dropDepDate: true });
      const csv = tracesCsv(h, d, { dropRoom: true });
      write(rf, `FEHLER_departures_${t}_spalte-fehlt.pdf`, broken.bytes);
      write(rf, `FEHLER_traces_${t}_spalte-fehlt.csv`, csv);
      write(rf, `VORTAG_arrivals_${tag(DAYS[3])}.pdf`, prevArrivals!);
      write(rf, `DOPPELT_inhouse_${t}.pdf`, lists.inhouse.bytes);
      const b = await read<DepartureRow>("departures.pdf", broken.bytes, day);
      const c = await read<TraceRow>("traces.csv", new TextEncoder().encode(csv), day);
      const v = await read<ArrivalRow>("arrivals.pdf", prevArrivals!, day);
      const crit = (r: { issues: { severity: string; code: string }[] }) => [...new Set(r.issues.filter((i) => i.severity === "CRITICAL").map((i) => i.code))];
      if (!crit(b).length) problems.push("Randfall Departures ohne Spalte: Parser meldet keinen kritischen Befund");
      if (!crit(c).includes("COLUMN_MISSING")) problems.push("Randfall Traces-CSV ohne Zimmerspalte: COLUMN_MISSING fehlt");
      if (!v.issues.some((i) => i.code === "LIST_NOT_TODAY")) problems.push("Randfall Vortagsliste: LIST_NOT_TODAY fehlt");
      e.manuellImTagesverlauf.randfaelle = [
        { datei: `FEHLER_departures_${t}_spalte-fehlt.pdf`, was: "Spalte „Dep. Date“ fehlt", sollImParser: crit(b), sollInDerApp: "kritischer Befund, Übernehmen gesperrt, verständliche Meldung" },
        { datei: `FEHLER_traces_${t}_spalte-fehlt.csv`, was: "Pflichtspalte „Room No.“ fehlt", sollImParser: crit(c), sollInDerApp: "kritischer Befund COLUMN_MISSING, Übernehmen gesperrt" },
        { datei: `DOPPELT_inhouse_${t}.pdf`, was: "dieselbe In-House-Liste ein zweites Mal", sollInDerApp: "ersetzt den Stand, keine doppelten Zimmer/Aufenthalte, Plan und Handzuteilungen bleiben" },
        { datei: `VORTAG_arrivals_${tag(DAYS[3])}.pdf`, was: "Arrivals von gestern aus Versehen", sollImParser: ["LIST_NOT_TODAY (Warnung)"], sollInDerApp: "als veraltet erkannt, zählt nicht ohne „Trotzdem verwenden“" },
      ];
    }
    prevArrivals = lists.arrivals.bytes;
    write(dir, "erwartung.json", json(e));
    es.push(e);
  }

  // Drehbuch-Prüfungen (P8: Tag-1-Gäste haben Wäschewechsel erst an Tag 4)
  if (es[2].zimmer.tag1LangbleiberWaesche.length) problems.push("P8: Tag-1-Gäste hätten schon an Tag 3 Wäschewechsel");
  if (es[3].zimmer.tag1LangbleiberWaesche.length !== h.tag1LongStayers.length) problems.push("P8: an Tag 4 ist nicht bei allen Tag-1-Langbleibern Wäschewechsel fällig");
  if (es[1].vipAnreisenEtage5 < 6) problems.push("Tag 2: weniger als 6 VIP-Anreisen auf Etage 5");

  write(OUT, "haus.json", json({
    hinweis: "Erfundener Hausbestand der Simulation — keine echten Gäste.", tage: DAYS.map((x, i) => `${WEEKDAY_DE[i]} ${x}`),
    ausserBetriebTag5: h.oooDay5, zimmerwechselTag5: h.roomMoveDay5, lateCheckoutVonHandTag2: h.day2ManualLate, greenOptionTag4: h.greenOptionDay4, tag1Langbleiber: h.tag1LongStayers,
    gaeste: h.guests.map((g) => ({ id: g.id, anzeige: [g.salutation, g.title, g.last].filter(Boolean).join(" "), opera: operaName(g), sprache: g.lang, zimmer: g.room, etage: floorOf(g.room), credit: creditOf(g.room),
      anreise: g.arr, abreise: g.dep, vorzeitigAbgereist: g.earlyOut ?? null, vip: g.vip || null, erwachsene: g.adl, kinder: g.chl, anreisezeit: g.arrTime, lateCheckout: g.lateDep ?? null,
      traces: g.traces.map((t) => ({ tag: t.day, abteilung: t.dept, code: t.code, text: t.text })) })),
  }));
  const md = overview(h, es);
  write(OUT, "README.md", md);
  console.log(md.split("\n").slice(6, 22).join("\n"));
  console.log(problems.length ? `\n✖ ${problems.length} Abweichung(en):\n` + problems.join("\n") : `\n✔ Alle 25 Listen vom App-Parser fehlerfrei gelesen, Zahlen = erwartung.json${checkOnly ? " (nur geprüft)" : ""}`);
  process.exit(problems.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
