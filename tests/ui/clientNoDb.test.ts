import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keine Client-Komponente ("use client") darf — auch über Umwege — `@/lib/db` (Prisma) als Wert importieren.
 * Anlass: S0 liest in db.ts beim Laden `Prisma.dmmf`; im Browser ist das undefined → /planung stürzte ab
 * („Cannot read properties of undefined (reading 'datamodel')“, Weg ServiceOverview.tsx → serviceOverview.ts → db.ts).
 * Reine Typ-Importe (`import type …`) zählen nicht, sie verschwinden beim Bauen.
 */
const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");
const DB = path.join(SRC, "lib", "db.ts");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  return null;
};
const IMPORT_RE = /(?:import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g;
const depCache = new Map<string, string[]>();
const valueDeps = (f: string) => {
  let d = depCache.get(f);
  if (!d) {
    d = [...readFileSync(f, "utf8").matchAll(IMPORT_RE)].filter((m) => !m[1]).map((m) => resolve(f, m[2] ?? m[3])).filter((x): x is string => !!x);
    depCache.set(f, d);
  }
  return d;
};
const isClient = (f: string) => /^\s*["']use client["']/.test(readFileSync(f, "utf8"));

/** Weg zu db.ts (oder null) — gemerkt je Datei, damit der Scan über alle Client-Dateien schnell bleibt. */
const pathToDb = new Map<string, string[] | null>();
function reachDb(f: string, stack: Set<string>): string[] | null {
  if (f === DB) return [f];
  if (pathToDb.has(f)) return pathToDb.get(f)!;
  if (stack.has(f)) return null; // Zyklus: hier nicht merken
  stack.add(f);
  let found: string[] | null = null;
  for (const d of valueDeps(f)) { const p = reachDb(d, stack); if (p) { found = [f, ...p]; break; } }
  stack.delete(f);
  pathToDb.set(f, found);
  return found;
}

describe("Client-Bündel ohne Prisma", () => {
  it("keine \"use client\"-Datei erreicht @/lib/db über Wert-Importe", () => {
    const clients = walk(SRC).filter((f) => /\.tsx?$/.test(f) && isClient(f));
    expect(clients.length).toBeGreaterThan(50);
    const bad = clients.map((c) => reachDb(c, new Set())).filter((p): p is string[] => !!p)
      .map((p) => p.map((x) => path.relative(ROOT, x)).join(" → "));
    expect(bad).toEqual([]);
  }, 30_000);
});
