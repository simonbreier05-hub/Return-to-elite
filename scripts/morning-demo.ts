/**
 * Spielt einen Morgen durch: vier Opera-Listen ablegen → Vorschau → Hinweise
 * → Nachimport → Übernehmen → "Stand der Daten". Nutzt die Nachbau-PDFs
 * (erfundene Namen) und eine WEGWERF-Datenbank:
 *
 *   DATABASE_URL=file:/pfad/morning.db npx prisma db push
 *   DATABASE_URL=file:/pfad/morning.db npx tsx scripts/morning-demo.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { detectListType } from "../src/lib/import/detect";
import { extractPdfLines } from "../src/lib/import/pdfText";
import { crossCheckArrivals, parseArrivals, parseDepartures, parseForecast, parseTracesPdf } from "../src/lib/import/parsers";
import { applyBatch, buildPreview, dataStatus, sha256, storeBatch } from "../src/lib/import/store";
import { classifyTraceText } from "../src/lib/import/traceClassifier";
import type { ArrivalRow, DepartureRow, ParseIssue, ParseResult } from "../src/lib/import/types";
import { DEMO_ROOMS } from "../tests/fixtures/opera/scenario";

const DIR = path.join(__dirname, "..", "tests", "fixtures", "opera");
const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;
const h = (t: string) => console.log(`\n━━ ${t} ${"━".repeat(Math.max(0, 70 - t.length))}`);
const showIssues = (is: ParseIssue[]) => is.forEach((i) => console.log(`   ${ICON[i.severity]} [${i.code}] ${i.message}`));

async function drop(file: string) {
  const bytes = new Uint8Array(readFileSync(path.join(DIR, file)));
  const lines = await extractPdfLines(bytes);
  const type = detectListType(lines, file);
  console.log(`📄 ${file} → erkannt als ${type ?? "UNBEKANNT (StayClean fragt nach)"}  [${lines.length} Textzeilen, Hash ${sha256(bytes).slice(0, 8)}…]`);
  const parse = { ARRIVALS: parseArrivals, DEPARTURES: parseDepartures, FORECAST: parseForecast, TRACES: parseTracesPdf }[type!];
  return { bytes, result: parse(lines) as ParseResult<never>, type: type! };
}

async function main() {
  const dm = await prisma.user.upsert({
    where: { email: "dm@example.test" }, update: {},
    create: { email: "dm@example.test", name: "Test Duty Manager", passwordHash: "x", role: "duty_manager" },
  });
  for (const n of DEMO_ROOMS) {
    await prisma.room.upsert({ where: { number: n }, update: {}, create: { number: n, floor: Number(n[0]), section: `${n[0]}A`, type: "STANDARD" } });
  }
  const known = new Set((await prisma.room.findMany({ select: { number: true } })).map((r) => r.number));

  h("1. Dateien ablegen (Drag-and-drop, 4 Listen, Arrivals nur Seite 1)");
  const files = ["arrivals_nachbau_nur_seite1.pdf", "departures_nachbau.pdf", "forecast_nachbau.pdf", "traces_nachbau.pdf"];
  const dropped = [];
  for (const f of files) dropped.push(await drop(f));

  h("2. Vorschau und Hinweise je Liste");
  const arr1 = dropped[0].result as unknown as ParseResult<ArrivalRow>;
  const dep = dropped[1].result as unknown as ParseResult<DepartureRow>;
  const cross = crossCheckArrivals(arr1, dep);
  for (const d of dropped) {
    const extra = d.type === "ARRIVALS" ? cross : [];
    const pv = buildPreview(d.result);
    console.log(`\n${d.type}: ${pv.count} Zeilen · Zeitraum ${pv.periodFrom ?? "—"} … ${pv.periodTo ?? "—"} · Druckdatum ${pv.reportDate} · Seiten ${pv.pages.seen}/${pv.pages.total ?? "?"} · Datum: ${pv.dateFormat.format} (${pv.dateFormat.via})`);
    console.log("   erste Zeilen (Namen maskiert):", JSON.stringify(pv.sample.slice(0, 2)));
    showIssues([...d.result.issues, ...extra]);
  }

  h("3. Arrivals unvollständig → richtige Datei nachliefern (ersetzt die Vorschau)");
  const arr2 = await drop("arrivals_nachbau.pdf");
  dropped[0] = arr2;
  const arr = arr2.result as unknown as ParseResult<ArrivalRow>;
  console.log(`   ${arr.rows.length} Zimmer, Gegenprobe zu Departures: ${crossCheckArrivals(arr, dep).length ? "FEHLT NOCH" : "vollständig ✔"}`);
  showIssues(arr.issues);

  h("4. Übernehmen");
  for (const d of dropped) {
    const { batch, critical } = await storeBatch({ result: d.result, uploadedById: dm.id, fileHash: sha256(d.bytes), knownRooms: known });
    if (critical) { console.log(`   ${d.type}: KRITISCH — nichts übernommen`); continue; }
    await applyBatch(batch.id, dm.id);
    console.log(`   ${d.type}: übernommen (${batch.rowCount} Zeilen, Geschäftsdatum ${batch.businessDate})`);
  }

  h("5. Nachimport derselben Datei (Hash gleich) ersetzt den Stand");
  const again = await storeBatch({ result: dropped[1].result, uploadedById: dm.id, fileHash: sha256(dropped[1].bytes), knownRooms: known });
  showIssues(again.issues.filter((i) => i.code === "SAME_FILE"));
  await applyBatch(again.batch.id, dm.id);
  console.log(`   DEPARTURES-Stände in der DB: ${await prisma.importBatch.count({ where: { type: "DEPARTURES", status: "APPLIED" } })} (ein Stand je Tag)`);

  h("6. Stand der Daten (Planungshub)");
  const st = await dataStatus();
  for (const [k, v] of Object.entries(st)) console.log(`   ${k.padEnd(11)} ${v ? `Stand ${v.businessDate}, ${v.rows} Zeilen` : "— nicht importiert"}`);
  console.log(`   ForecastDay-Zeilen: ${await prisma.forecastDay.count()}`);

  h("7. Vorschau auf den Tag (M2 baut das richtig; hier nur gezählt)");
  const today = dep.reportDate!;
  const out = dep.rows.filter((r) => r.depDate === today).map((r) => r.room);
  const stay = dep.rows.filter((r) => r.depDate > today && r.arrDate <= today).map((r) => r.room);
  const incoming = arr.rows.filter((r) => r.arrDate === today);
  console.log(`   Heute ${today}: Abreisen ${out.length} (${out.join(", ")}) · Bleiber ${stay.length} (${stay.join(", ")}) · Anreisen laut Liste heute: ${incoming.length}`);
  console.log(`   (Die Arrivals-Liste gilt für ${arr.periodFrom} — Demo-Druck ist einen Tag älter.)`);
  const traces = (dropped[3].result as unknown as ParseResult<{ room: string; text: string }>).rows;
  console.log("   Hausmann-Aufgaben aus Traces:");
  for (const t of traces) { const c = classifyTraceText(t.text); if (c) console.log(`     Zimmer ${t.room}: ${c.type}${c.note ? ` (${c.note})` : ""}`); }

  const rowsJson = JSON.stringify(await prisma.importRow.findMany());
  console.log(`\nWhitelist-Prüfung in der DB: Kartennummer ${rowsJson.includes("4111") ? "GEFUNDEN ✖" : "nicht vorhanden ✔"}, Preis "399.00" ${rowsJson.includes("399.00") ? "GEFUNDEN ✖" : "nicht vorhanden ✔"}`);
  const aud = await prisma.auditLog.findMany({ where: { action: { startsWith: "IMPORT" } } });
  console.log(`Audit: ${aud.length} Einträge, Beispiel-Meta: ${aud[0]?.meta}`);
}
main().finally(() => prisma.$disconnect());
