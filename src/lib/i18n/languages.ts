/**
 * Sprachen der Mitarbeiter-Oberfläche (Prompt K1). Reine Logik, client- und server-sicher.
 *
 * Drei Stufen:
 *  - Quelle/vollständig: Deutsch (Quellsprache) und Englisch (`src/lib/i18n/translations.ts`, typgeprüft).
 *  - Prioritätssprachen: eigene, versionierte Dateien `src/lib/i18n/locales/<code>.json`
 *    (erste Fassung maschinell, „nicht muttersprachlich geprüft“).
 *  - Alle übrigen: zur Laufzeit maschinell übersetzt (`/api/i18n/[lang]`, TranslationProvider), gekennzeichnet.
 *
 * Fallback immer: gewählte Sprache → Englisch → Deutsch.
 */

export const SOURCE_LANGUAGE = "de";
export const FALLBACK_LANGUAGE = "en";

/** Reihenfolge = Priorität der Pflege (zuerst Vietnamesisch). */
export const PRIORITY_LANGUAGES = ["vi", "it", "tr", "fa", "hi"] as const;
export type PriorityLanguage = (typeof PRIORITY_LANGUAGES)[number];

export const BUILTIN_LANGUAGES = ["de", "en"] as const;

/** Schreibrichtung rechts-nach-links (ISO 639-1/-3 Basiscodes). */
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "iw", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "ku"]);

/**
 * Alle wählbaren Sprachen (ISO 639-1). Die Namen kommen nicht aus dieser Liste, sondern aus
 * `Intl.DisplayNames` — jede Sprache wird in ihrer eigenen Sprache benannt („Tiếng Việt“, „فارسی“).
 */
export const ALL_LANGUAGE_CODES = [
  "af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et", "eu",
  "fa", "fi", "fil", "fr", "ga", "gl", "gu", "ha", "he", "hi", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "ja",
  "jv", "ka", "kk", "km", "kn", "ko", "ku", "ky", "lb", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms",
  "mt", "my", "ne", "nl", "no", "ny", "or", "pa", "pl", "ps", "pt", "ro", "ru", "rw", "sd", "si", "sk", "sl", "sm",
  "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk", "tr", "tt", "ug", "uk", "ur",
  "uz", "vi", "xh", "yi", "yo", "zh", "zu",
] as const;

/** ISO-639-Sprachcode, optional mit Region („de“, „pl“, „pt-BR“) — dieselbe Regel wie `LANGUAGE_CODE_RE` in settings.ts. */
const CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** „de-DE“, „DE“, „pt_br“ → „de“, „de“, „pt“; ungültig → null. Die Oberfläche arbeitet nur mit Basiscodes. */
export function normalizeLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw.trim().replace("_", "-").split("-")[0].toLowerCase();
  if (base === "iw") return "he";
  if (base === "nb" || base === "nn") return "no";
  if (base === "tl") return "fil";
  return CODE_RE.test(base) && (ALL_LANGUAGE_CODES as readonly string[]).includes(base) ? base : null;
}

export function isPriorityLanguage(lang: string): lang is PriorityLanguage {
  return (PRIORITY_LANGUAGES as readonly string[]).includes(lang);
}

export function isBuiltinLanguage(lang: string): boolean {
  return (BUILTIN_LANGUAGES as readonly string[]).includes(lang);
}

/** "builtin" (de/en), "priority" (eigene Datei) oder "runtime" (maschinell zur Laufzeit). */
export function languageTier(lang: string): "builtin" | "priority" | "runtime" {
  if (isBuiltinLanguage(lang)) return "builtin";
  if (isPriorityLanguage(lang)) return "priority";
  return "runtime";
}

export function dirFor(lang: string): "rtl" | "ltr" {
  return RTL_LANGUAGES.has(lang.split("-")[0]) ? "rtl" : "ltr";
}

/** Nachschlage-Reihenfolge: gewählte Sprache → Englisch → Deutsch (ohne Doppelte). */
export function fallbackChain(lang: string): string[] {
  return [...new Set([lang, FALLBACK_LANGUAGE, SOURCE_LANGUAGE])];
}

/**
 * Locale für Intl: immer lateinische Ziffern (1, 2, 3 …), auch auf Persisch/Arabisch/Hindi —
 * Zimmernummern, Etagen und Uhrzeiten sollen überall gleich aussehen.
 */
export function intlLocale(lang: string): string {
  return `${lang}-u-nu-latn`;
}

/** Sprachname in der Sprache selbst („Deutsch“, „Tiếng Việt“, „فارسی“); unbekannt → Code. */
export function autonym(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code);
    if (name) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // ältere Engines kennen DisplayNames nicht
  }
  return code;
}

/** Sprachname in der aktuellen Oberflächensprache (für die Suche: „Vietnamesisch“ findet „Tiếng Việt“). */
export function languageNameIn(code: string, uiLang: string): string {
  try {
    return new Intl.DisplayNames([uiLang], { type: "language", fallback: "none" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Erste Browser-Sprache, die wir kennen (für den Vorschlag beim ersten Login). */
export function browserLanguage(languages: readonly string[] | undefined): string | null {
  for (const l of languages ?? []) {
    const n = normalizeLanguage(l);
    if (n) return n;
  }
  return null;
}
