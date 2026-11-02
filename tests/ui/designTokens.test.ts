import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs-Skript ohne Typen
import { checkColors, findHardcodedColors } from "../../scripts/check-no-hardcoded-colors.mjs";

const ROOT = path.join(__dirname, "..", "..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("Design „Glas & Premium“ — Token und Regeln", () => {
  it("check:colors: keine harten Farben in src/components/ui", () => {
    const { errors, strictCount } = checkColors(ROOT);
    expect(strictCount).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });
  it("Prüfskript erkennt harte Farben, ignoriert Kommentare und Token", () => {
    expect(findHardcodedColors('const a = "#133457";').length).toBe(1);
    expect(findHardcodedColors("color: rgba(0,0,0,.1);").length).toBe(1);
    expect(findHardcodedColors("hsl(10 20% 30%)").length).toBe(1);
    expect(findHardcodedColors('// #133457\nclassName="text-text-muted bg-surface-card"').length).toBe(0);
    expect(findHardcodedColors('href="#board-basis"').length).toBe(0);
  });
  it("alle Farb-Token der Spezifikation stehen 1:1 in glass-tokens.css", () => {
    const spec = read("docs/design/glass-spec.md");
    const css = read("src/styles/glass-tokens.css").toLowerCase();
    const norm = (v: string) => v.replace(/\s+/g, "").replace(/\(([^)]*)\)/, (_m, inner: string) => `(${inner.split(",").map((x) => String(Number(x))).join(",")})`).toLowerCase();
    const cssVars = new Map([...css.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], norm(m[2])]));
    let count = 0;
    for (const row of spec.matchAll(/^\| `(--color-[a-z-]+)`(?: \/ `-([a-z]+)`)? \| `([^`]+)`(?: \/ `([^`]+)`)? \|/gm)) {
      const [, name, suffix2, v1, v2] = row;
      const pairs: Array<[string, string]> = suffix2 ? [[`${name}-${suffix2 === "bg" ? "fg" : "bg"}`, v1], [`${name}-${suffix2}`, v2!]] : [[name, v1]];
      // „--color-status-success-fg / -bg“: erste Spalte = fg, zweite = bg; Pillen: bg / border
      if (suffix2) {
        const base = name.replace(/-(fg|bg)$/, "");
        pairs.splice(0, 2, [name, v1], [`${base}-${suffix2}`, v2!]);
      }
      for (const [n, v] of pairs) {
        expect(cssVars.get(n), n).toBe(norm(v));
        count++;
      }
    }
    expect(count).toBe(28);
  });
  it("Radien und Abstände der Spezifikation", () => {
    const css = read("src/styles/glass-tokens.css");
    for (const [n, v] of [["--glass-radius-sm", 15], ["--glass-radius-md", 18], ["--radius-tile", 22], ["--glass-radius-lg", 25], ["--glass-radius-xl", 32], ["--radius-pill", 999]] as const) {
      expect(css, n).toMatch(new RegExp(`${n}:\\s*${v}px;`));
    }
    for (const [n, v] of [["xs", 4], ["sm", 8], ["md", 12], ["lg", 16], ["xl", 24], ["2xl", 32], ["3xl", 40]] as const) {
      expect(css).toMatch(new RegExp(`--space-${n}:\\s*${v}px;`));
    }
    // Tailwind-Standardradien nur im neuen Design überschreiben, nie global (alte Seiten unverändert)
    expect(css).toMatch(/\.theme-glass \{[^}]*--radius-lg: var\(--glass-radius-lg\)/);
    expect(css).not.toMatch(/@theme[^{]*\{[^}]*--radius-(sm|md|lg|xl):/);
  });
  it("kein backdrop-filter/Blur in neuen Styles und Bausteinen", () => {
    const files = ["src/styles/glass.css", "src/styles/glass-tokens.css", ...walk(path.join(ROOT, "src/components/ui")).map((f) => path.relative(ROOT, f))];
    for (const f of files) expect(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), f).not.toMatch(/backdrop-filter|backdrop-blur|\bblur\(|\bblur-/);
  });
  it("Bewegung: nur transform/opacity, kein „both/forwards“, reduced-motion schaltet ab", () => {
    const css = read("src/styles/glass.css");
    for (const m of css.matchAll(/@keyframes (sc-[a-z-]+) \{([\s\S]*?)\n\}/g)) {
      for (const p of [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1])) expect(["transform", "opacity"], `${m[1]}: ${p}`).toContain(p);
    }
    expect(css).not.toMatch(/animation:[^;]*\b(both|forwards|infinite)\b/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\n\}/)?.[0] ?? "";
    for (const cls of [".animate-in-up", ".animate-sheet-up", ".animate-slide-in-end", ".press"]) expect(reduced, cls).toContain(cls);
  });
  it("Schriften lokal mit font-display: swap, kein Google-Fonts-Aufruf", () => {
    const css = read("src/styles/glass-fonts.css");
    expect(css).not.toMatch(/googleapis|gstatic/);
    expect([...css.matchAll(/font-display: swap/g)].length).toBe(6);
    for (const f of [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1])) {
      expect(statSync(path.join(ROOT, "public/fonts", f)).size, f).toBeGreaterThan(5000);
    }
    expect(read("public/fonts/LICENSE.txt")).toMatch(/SIL Open Font License/);
  });
  it("globals.css bindet die neuen Styles ein, alte Palette bleibt", () => {
    const g = read("src/app/globals.css");
    expect(g).toMatch(/@import "\.\.\/styles\/glass-tokens\.css";/);
    expect(g).toMatch(/--color-navy: #133457;/);
  });
});
