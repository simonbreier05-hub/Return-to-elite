/**
 * Diagnose: liest Opera-Listen (PDF/XLSX/CSV) mit den echten Parsern und gibt je Liste Zeilen und Befunde aus —
 * nur Zahlen, Zimmernummern und Codes, nie Gastnamen.  Aufruf: npx tsx scripts/diagnose-import.ts <Datei…> [--day=YYYY-MM-DD]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadList, parseList } from "@/lib/import/readFile";

async function main() {
const args = process.argv.slice(2);
const day = args.find((a) => a.startsWith("--day="))?.slice(6);
for (const f of args.filter((a) => !a.startsWith("--"))) {
  const list = await loadList(basename(f), new Uint8Array(readFileSync(f)));
  if (!list.type) { console.log(`${basename(f)}: Listentyp nicht erkannt`); continue; }
  const r = parseList(list.type, list, { expectedDate: day, today: day });
  const rows = r.rows as { room?: string; status?: string | null; depDate?: string }[];
  const status: Record<string, number> = {};
  for (const x of rows) if (x.status !== undefined) status[x.status ?? "—"] = (status[x.status ?? "—"] ?? 0) + 1;
  const byDep: Record<string, number> = {};
  if (list.type === "DEPARTURES") for (const x of rows) byDep[x.depDate!] = (byDep[x.depDate!] ?? 0) + 1;
  console.log(`\n${basename(f)} → ${list.type}: ${rows.length} Zeilen, Seiten ${r.pagesSeen}/${r.pagesTotal ?? "?"}, Datum ${r.reportDate ?? "—"}`);
  if (Object.keys(status).length) console.log("  Status:", JSON.stringify(status));
  if (Object.keys(byDep).length) console.log("  je Abreisetag:", JSON.stringify(byDep));
  for (const i of r.issues) console.log(`  [${i.severity}] ${i.code}${i.room ? ` Zi ${i.room}` : ""}${i.page ? ` S.${i.page}` : ""}: ${i.message.slice(0, 160)}`);
}
}
void main();
