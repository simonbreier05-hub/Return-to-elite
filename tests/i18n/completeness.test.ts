import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_KEYS, SOURCE_DICTS } from "@/lib/i18n/core";
import { PRIORITY_LANGUAGES } from "@/lib/i18n/languages";
import type { LocaleFile } from "@/lib/i18n/bundles";

/**
 * Findet unvollständige oder veraltete Sprachdateien (Prompt K1). Rot, wenn
 *  - Englisch nicht dieselben Schlüssel wie Deutsch hat,
 *  - einer Prioritätssprache ein Schlüssel fehlt (oder leer ist),
 *  - eine Datei Schlüssel enthält, die es in der Quelle nicht (mehr) gibt,
 *  - Platzhalter ({{n}} …) fehlen oder dazuerfunden sind.
 */
const load = (lang: string): LocaleFile => JSON.parse(readFileSync(path.join(__dirname, "../../src/lib/i18n/locales", `${lang}.json`), "utf8"));
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe("Quellsprachen", () => {
  it("Englisch hat genau die deutschen Schlüssel, keiner leer", () => {
    expect(Object.keys(SOURCE_DICTS.en).sort()).toEqual(Object.keys(SOURCE_DICTS.de).sort());
    expect(Object.entries(SOURCE_DICTS.en).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
  it("Platzhalter in Englisch passen zu Deutsch", () => {
    const bad = ALL_KEYS.filter((k) => placeholders(SOURCE_DICTS.de[k]).join() !== placeholders(SOURCE_DICTS.en[k]).join());
    expect(bad).toEqual([]);
  });
});

describe.each([...PRIORITY_LANGUAGES])("Sprachdatei %s", (lang) => {
  const file = load(lang);
  it("Kopf ist gepflegt (Version, Prüfstatus)", () => {
    expect(file._meta.language).toBe(lang);
    expect(file._meta.version).toBeGreaterThanOrEqual(1);
    expect(["machine", "partial", "reviewed"]).toContain(file._meta.status);
    expect(typeof file._meta.reviewed).toBe("boolean");
    for (const k of file._meta.reviewedKeys ?? []) expect(ALL_KEYS).toContain(k);
  });
  it("alle Schlüssel vorhanden und nicht leer (Teil 1 + Teil 2 = die ganze Mitarbeiter-Oberfläche)", () => {
    const missing = ALL_KEYS.filter((k) => !file.strings[k]?.trim());
    expect(missing, `fehlend in ${lang}.json`).toEqual([]);
  });
  it("keine veralteten Schlüssel", () => {
    expect(Object.keys(file.strings).filter((k) => !(k in SOURCE_DICTS.de))).toEqual([]);
  });
  it("Platzhalter wie im Deutschen", () => {
    const bad = Object.entries(file.strings).filter(([k, v]) => placeholders(v).join() !== placeholders(SOURCE_DICTS.de[k] ?? "").join()).map(([k]) => k);
    expect(bad).toEqual([]);
  });
  it("Zahlen bleiben lateinische Ziffern (keine persischen/arabischen/Devanagari-Ziffern)", () => {
    const bad = Object.entries(file.strings).filter(([, v]) => /[\u06F0-\u06F9\u0660-\u0669\u0966-\u096F]/.test(v)).map(([k]) => k);
    expect(bad).toEqual([]);
  });
});
