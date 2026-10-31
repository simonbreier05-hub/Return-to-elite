/**
 * Werkzeug für die Prioritäts-Sprachdateien (Prompt K1).
 *
 *   npm run i18n:review -- vi [datei.tsv]   Gegenlese-Tabelle: Schlüssel | Deutsch | Englisch | Übersetzung | geprüft
 *   npm run i18n:import -- vi datei.tsv [--reviewed "Name"]
 *       Übernimmt Spalte „Übersetzung“ (oder bei 2 Spalten: Schlüssel, Text) in src/lib/i18n/locales/vi.json,
 *       erhöht die Version; mit --reviewed werden die übernommenen Schlüssel als muttersprachlich geprüft vermerkt.
 *   npm run i18n:missing                    Zeigt je Sprache die fehlenden Schlüssel (Teil 1 und gesamt).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ALL_KEYS, SOURCE_DICTS } from "../src/lib/i18n/core";
import { PRIORITY_LANGUAGES, isPriorityLanguage } from "../src/lib/i18n/languages";
import { inPhase1 } from "../src/lib/i18n/coverage";
import type { LocaleFile } from "../src/lib/i18n/bundles";

const DIR = path.join(__dirname, "..", "src", "lib", "i18n", "locales");
const file = (lang: string) => path.join(DIR, `${lang}.json`);
const read = (lang: string): LocaleFile => JSON.parse(readFileSync(file(lang), "utf8"));
const clean = (s: string) => s.replace(/\t|\r?\n/g, " ").trim();

function write(lang: string, data: LocaleFile) {
  // Schlüssel in der Reihenfolge der Quelle — so bleiben Diffs klein und Muttersprachler finden Zusammengehöriges beieinander
  const strings: Record<string, string> = {};
  for (const k of ALL_KEYS) if (data.strings[k]) strings[k] = data.strings[k];
  writeFileSync(file(lang), `${JSON.stringify({ _meta: data._meta, strings }, null, 2)}\n`);
}

const [cmd, lang, arg, ...rest] = process.argv.slice(2);
if (cmd === "missing") {
  for (const l of PRIORITY_LANGUAGES) {
    const f = read(l);
    const miss1 = ALL_KEYS.filter(inPhase1).filter((k) => !f.strings[k]);
    const missAll = ALL_KEYS.filter((k) => !f.strings[k]);
    console.log(`${l}: Teil 1 fehlt ${miss1.length}, gesamt fehlt ${missAll.length}/${ALL_KEYS.length}${miss1.length ? `\n  ${miss1.join("\n  ")}` : ""}`);
  }
  process.exit(0);
}
if (!lang || !isPriorityLanguage(lang)) {
  console.error(`Sprache fehlt oder ist keine Prioritätssprache (${PRIORITY_LANGUAGES.join(", ")}).`);
  process.exit(1);
}
if (cmd === "review") {
  const f = read(lang);
  const reviewed = new Set(f._meta.reviewedKeys ?? []);
  const rows = [["Schlüssel", "Deutsch", "Englisch", "Übersetzung", "geprüft"].join("\t")];
  for (const k of ALL_KEYS) rows.push([k, clean(SOURCE_DICTS.de[k]), clean(SOURCE_DICTS.en[k]), clean(f.strings[k] ?? ""), reviewed.has(k) ? "ja" : ""].join("\t"));
  const out = arg ?? `i18n-review-${lang}.tsv`;
  writeFileSync(out, `${rows.join("\n")}\n`);
  console.log(`${out}: ${ALL_KEYS.length} Zeilen`);
} else if (cmd === "import") {
  if (!arg) throw new Error("Datei fehlt");
  const reviewerIdx = rest.indexOf("--reviewed");
  const reviewer = reviewerIdx >= 0 ? rest[reviewerIdx + 1] ?? "unbekannt" : null;
  const f = read(lang);
  const lines = readFileSync(arg, "utf8").split(/\r?\n/).filter(Boolean);
  let n = 0;
  const reviewed = new Set(f._meta.reviewedKeys ?? []);
  for (const line of lines) {
    const cols = line.split("\t");
    const key = cols[0];
    const text = cols.length >= 4 ? cols[3] : cols[1];
    if (!(key in SOURCE_DICTS.de) || !text?.trim()) continue;
    f.strings[key] = text.trim();
    if (reviewer) reviewed.add(key);
    n++;
  }
  f._meta.version += 1;
  f._meta.updated = new Date().toISOString().slice(0, 10);
  if (reviewer) {
    f._meta.reviewedKeys = [...reviewed];
    f._meta.reviewedBy = reviewer;
    f._meta.reviewed = ALL_KEYS.filter(inPhase1).every((k) => reviewed.has(k));
    f._meta.status = f._meta.reviewed ? "reviewed" : "partial";
  }
  write(lang, f);
  console.log(`${lang}.json: ${n} Texte übernommen, Version ${f._meta.version}`);
} else {
  console.error("Befehl: review | import | missing");
  process.exit(1);
}
