/**
 * Kern der Mitarbeiter-Übersetzung (Prompt K1): flache Wörterbücher, Rückfallkette, Platzhalter,
 * Meldung fehlender Schlüssel. Reine Logik, client- und server-sicher.
 */
import { dictionaries } from "./translations";
import { fallbackChain } from "./languages";

export type FlatDict = Record<string, string>;
export type Vars = Record<string, string | number>;

export function flatten(obj: unknown, prefix = "", out: FlatDict = {}): FlatDict {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string") out[prefix + k] = v;
      else flatten(v, `${prefix}${k}.`, out);
    }
  }
  return out;
}

/** Deutsch (Quelle) und Englisch (vollständig), flach. */
export const SOURCE_DICTS: { de: FlatDict; en: FlatDict } = {
  de: flatten(dictionaries.de),
  en: flatten(dictionaries.en),
};

/** Alle Schlüssel der Quellsprache — Maßstab für Vollständigkeit. */
export const ALL_KEYS: readonly string[] = Object.keys(SOURCE_DICTS.de);

export function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  let out = str;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(String(v));
  return out;
}

type MissingListener = (lang: string, key: string) => void;
const listeners = new Set<MissingListener>();
const warned = new Set<string>();

/** Fehlende Schlüssel abonnieren (Tests, Entwicklerkonsole). Rückgabe: Abmelden. */
export function onMissingKey(fn: MissingListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function reportMissing(lang: string, key: string) {
  for (const fn of listeners) fn(lang, key);
  const id = `${lang}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  if (process.env.NODE_ENV !== "production") console.warn(`[i18n] fehlender Schlüssel „${key}“ für ${lang} — Rückfall auf Englisch/Deutsch`);
}

/**
 * Text für `key` in `lang`. Reihenfolge: Sprachdatei/Laufzeit-Übersetzung von `lang` → Englisch → Deutsch → Schlüssel.
 * Fehlt der Schlüssel in `lang`, wird das gemeldet (nicht für de/en, die typgeprüft vollständig sind).
 */
export function lookup(lang: string, key: string, extra: FlatDict | null | undefined): string {
  for (const l of fallbackChain(lang)) {
    const dict = l === "de" ? SOURCE_DICTS.de : l === "en" ? SOURCE_DICTS.en : l === lang ? extra : undefined;
    const hit = dict?.[key];
    if (typeof hit === "string" && hit !== "") {
      if (l !== lang) reportMissing(lang, key);
      return hit;
    }
  }
  reportMissing(lang, key);
  return key;
}

export function translateKey(lang: string, key: string, vars: Vars | undefined, extra: FlatDict | null | undefined): string {
  return interpolate(lookup(lang, key, extra), vars);
}
