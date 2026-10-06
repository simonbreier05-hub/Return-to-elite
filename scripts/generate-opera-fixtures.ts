/**
 * Erzeugt die Nachbau-Testdateien der Opera-Listen (erfundene Namen):
 *   tests/fixtures/opera/{arrivals,departures,forecast,traces}_nachbau.pdf (mit Textebene)
 *   tests/fixtures/opera/traces_nachbau.csv
 * Aufruf: npm run fixtures:opera
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildArrivalsPdf, buildDeparturesPdf, buildForecastPdf, buildTracesPdf } from "../tests/fixtures/opera/build";
import { TRACES_SAMPLE } from "../tests/fixtures/opera/tracesSample";

const OUT = path.join(__dirname, "..", "tests", "fixtures", "opera");

async function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "arrivals_nachbau.pdf"), await buildArrivalsPdf());
  writeFileSync(path.join(OUT, "arrivals_nachbau_nur_seite1.pdf"), await buildArrivalsPdf({ onlyFirstPage: true }));
  writeFileSync(path.join(OUT, "departures_nachbau.pdf"), await buildDeparturesPdf());
  writeFileSync(path.join(OUT, "forecast_nachbau.pdf"), await buildForecastPdf());
  writeFileSync(path.join(OUT, "traces_nachbau.pdf"), await buildTracesPdf());
  const head = "Room No.;Name;Arr. Date;Dep. Date;Dept.;Trace Code;Trace Date;Trace Text;Resolved";
  const lines = TRACES_SAMPLE.map((r) =>
    [r.room, r.name, r.arrDate, r.depDate, r.dept, r.code, r.traceDate, r.text, r.resolved ? "Y" : "N"].join(";"));
  writeFileSync(path.join(OUT, "traces_nachbau.csv"), [head, ...lines].join("\n") + "\n", "utf8");
  console.log("Fixtures geschrieben nach", OUT);
}
main();
