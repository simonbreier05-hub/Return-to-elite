#!/usr/bin/env node
/**
 * Prüft, dass die neuen Design-Bausteine nur Token benutzen (docs/design/glass-spec.md):
 * meldet harte Farbwerte (#hex, rgb(…), rgba(…), hsl(…), hsla(…)).
 *
 * - Pflicht (Fehler, Exit 1): alles unter src/components/ui/** und die Dateien unter „strict“
 *   in scripts/design-migrated-files.json.
 * - Nur Hinweis: Dateien unter „warn“ (in D1–D6 umgestellt, noch nicht abgenommen).
 *
 * Aufruf: npm run check:colors   (läuft auch in npm test über tests/ui/designTokens.test.ts)
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STRICT_DIRS = ["src/components/ui"];
const EXT = /\.(tsx?|jsx?|css)$/;

const PATTERNS = [
  { name: "#hex", re: /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g },
  { name: "rgb()/hsl()", re: /\b(?:rgba?|hsla?)\(/g },
];

/** Kommentare entfernen, Zeilen erhalten (damit Zeilennummern stimmen). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, (m, p) => p + " ".repeat(m.length - p.length));
}

export function findHardcodedColors(source) {
  const hits = [];
  const lines = stripComments(source).split("\n");
  lines.forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) hits.push({ line: i + 1, kind: name, match: m[0] });
    }
  });
  return hits;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : EXT.test(p) ? [p] : [];
  });
}

export function collectFiles(root = ROOT) {
  const cfgPath = path.join(root, "scripts/design-migrated-files.json");
  const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : { strict: [], warn: [] };
  const strict = [...STRICT_DIRS.flatMap((d) => walk(path.join(root, d))), ...(cfg.strict ?? []).map((f) => path.join(root, f))];
  const warn = (cfg.warn ?? []).map((f) => path.join(root, f));
  return { strict, warn };
}

export function checkColors(root = ROOT) {
  const { strict, warn } = collectFiles(root);
  const scan = (files) =>
    files.filter((f) => existsSync(f)).flatMap((f) => findHardcodedColors(readFileSync(f, "utf8")).map((h) => ({ file: path.relative(root, f), ...h })));
  return { errors: scan(strict), warnings: scan(warn), strictCount: strict.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, warnings, strictCount } = checkColors();
  for (const w of warnings) console.warn(`Hinweis  ${w.file}:${w.line}  harte Farbe ${w.match}`);
  for (const e of errors) console.error(`FEHLER   ${e.file}:${e.line}  harte Farbe ${e.match} — bitte Token aus docs/design/glass-spec.md nutzen`);
  if (errors.length) {
    console.error(`\n${errors.length} harte Farbwert(e) in Pflicht-Dateien.`);
    process.exit(1);
  }
  console.log(`check:colors ok — ${strictCount} Pflicht-Dateien ohne harte Farben${warnings.length ? `, ${warnings.length} Hinweis(e)` : ""}.`);
}
