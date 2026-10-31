import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dirFor, intlLocale } from "@/lib/i18n/languages";
import { formatDate, formatTime, formatNumber } from "@/lib/i18n/format";

const SRC = path.join(__dirname, "..", "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("Schreibrichtung", () => {
  it("Persisch, Arabisch, Hebräisch, Urdu rechts-nach-links; Rest links-nach-rechts", () => {
    for (const l of ["fa", "ar", "he", "ur"]) expect(dirFor(l)).toBe("rtl");
    for (const l of ["de", "en", "vi", "hi", "tr", "it"]) expect(dirFor(l)).toBe("ltr");
  });
  it("Provider setzt lang und dir am <html>", () => {
    const s = readFileSync(path.join(SRC, "lib/i18n/LocaleContext.tsx"), "utf8");
    expect(s).toMatch(/document\.documentElement\.dir = dirFor\(locale\)/);
    expect(s).toMatch(/document\.documentElement\.lang = locale/);
  });
  it("Grundriss und Haus-Bild werden nie gespiegelt (dir=ltr)", () => {
    expect(readFileSync(path.join(SRC, "components/FloorPlanGrid.tsx"), "utf8")).toMatch(/dir="ltr"/);
    expect(readFileSync(path.join(SRC, "components/planung/HouseMap.tsx"), "utf8")).toMatch(/dir="ltr"/);
  });
  it("Mitarbeiter-Oberfläche nutzt logische statt linker/rechter CSS-Klassen", () => {
    const files = walk(SRC).filter((f) => /\.(tsx|ts)$/.test(f) && !/\/g\/|guest/i.test(f));
    const physical = /(?<![\w-])(?:[a-z0-9]+:)*-?(?:ml|mr|pl|pr)-(?:\d|px\b|auto\b|\[)|(?<![\w-])(?:[a-z0-9]+:)*text-(?:left|right)(?![\w-])|(?<![\w-])(?:[a-z0-9]+:)*-?(?:left|right)-(?!1\/2)(?:\d|px\b|auto\b|full\b|\[)|(?<![\w-])(?:[a-z0-9]+:)*border-[lr](?=[\s"`'-])/;
    const offenders = files.filter((f) => physical.test(readFileSync(f, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""))).map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});

describe("Zahlen, Datum, Uhrzeit", () => {
  const d = new Date("2026-10-31T13:05:00Z"); // 14:05 in Berlin
  it("immer lateinische Ziffern — auch auf Persisch, Arabisch, Hindi", () => {
    for (const l of ["fa", "ar", "hi", "vi", "de"]) {
      expect(formatTime(l, d)).toMatch(/14.05/);
      expect(formatDate(l, d)).toMatch(/^[\x20-\x7E‎‏؜  /.\-٫,]*$/);
      expect(formatNumber(l, 1234.5)).toMatch(/[0-9]/);
      expect(formatNumber(l, 1234.5)).not.toMatch(/[۰-۹٠-٩०-९]/);
    }
    expect(intlLocale("fa")).toBe("fa-u-nu-latn");
    expect(intlLocale("en")).toBe("en-GB-u-nu-latn");
  });
  it("formatiert nach Sprache", () => {
    expect(formatDate("de", d)).toBe("31.10.2026");
    expect(formatDate("en", d)).toBe("31/10/2026");
  });
});
