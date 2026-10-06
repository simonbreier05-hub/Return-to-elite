/**
 * Erzeugt Nachbau-Testdateien einer Opera-Traces-Liste (erfundene Namen):
 *   tests/fixtures/opera/traces_nachbau.pdf  (mit Textebene)
 *   tests/fixtures/opera/traces_nachbau.csv  (Semikolon, UTF-8)
 * Aufruf: npm run fixtures:opera
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SAMPLE_REPORT_DATE, TRACES_SAMPLE } from "../tests/fixtures/opera/tracesSample";

const OUT = path.join(__dirname, "..", "tests", "fixtures", "opera");
const COLS = [
  { key: "room", label: "Room No.", x: 30 },
  { key: "name", label: "Name", x: 80 },
  { key: "arrDate", label: "Arr. Date", x: 200 },
  { key: "depDate", label: "Dep. Date", x: 255 },
  { key: "dept", label: "Dept.", x: 310 },
  { key: "code", label: "Trace Code", x: 345 },
  { key: "traceDate", label: "Trace Date", x: 405 },
  { key: "text", label: "Trace Text", x: 465 },
  { key: "resolved", label: "Resolved", x: 770 },
] as const;

async function pdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 quer
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const draw = (t: string, x: number, y: number, f = font, size = 8) =>
    page.drawText(t, { x, y, size, font: f, color: rgb(0, 0, 0) });

  draw("OPERA DEMO HOTEL", 350, 560, font, 10);
  draw(SAMPLE_REPORT_DATE, 790, 560);
  draw("04:20 AM", 790, 545);
  draw("Traces", 395, 535, italic, 11);

  let y = 505;
  for (const c of COLS) draw(c.label, c.x, y, font);
  page.drawLine({ start: { x: 30, y: y - 8 }, end: { x: 812, y: y - 8 }, thickness: 0.5 });

  y -= 26;
  for (const row of TRACES_SAMPLE) {
    for (const c of COLS) {
      const v = c.key === "resolved" ? (row.resolved ? "Y" : "N") : row[c.key];
      draw(v, c.x, y);
    }
    y -= 20;
  }

  draw("Filter: Trace Date From 05-14-18 To 05-19-18   Departments All   Resolved All", 30, 50);
  draw("Page 1 of 1", 400, 35, italic);
  draw("traces_all", 780, 35, italic);

  writeFileSync(path.join(OUT, "traces_nachbau.pdf"), await doc.save());
}

function csv() {
  const head = COLS.map((c) => c.label).join(";");
  const lines = TRACES_SAMPLE.map((r) =>
    COLS.map((c) => (c.key === "resolved" ? (r.resolved ? "Y" : "N") : r[c.key])).join(";"),
  );
  writeFileSync(path.join(OUT, "traces_nachbau.csv"), [head, ...lines].join("\n") + "\n", "utf8");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await pdf();
  csv();
  console.log("Fixtures geschrieben nach", OUT);
}
main();
