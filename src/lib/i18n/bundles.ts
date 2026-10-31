/**
 * Prioritäts-Sprachdateien (`./locales/<code>.json`) — je Sprache ein eigener Chunk, geladen erst bei Bedarf.
 *
 * Aufbau einer Datei (für Muttersprachler gedacht: flache Schlüssel, ein Text pro Zeile):
 *   "_meta":   { language, version, status: "machine" | "partial" | "reviewed", reviewed, reviewedBy, updated, note,
 *                reviewedKeys?: [Schlüssel, die schon geprüft sind] }
 *   "strings": { "common.cancel": "…", … }
 * Korrektur = Text ändern, `version` +1, Schlüssel in `reviewedKeys` eintragen. Gegenlese-Tabelle:
 * `npm run i18n:review -- vi` (Deutsch | Englisch | Übersetzung).
 */
import type { FlatDict } from "./core";
import type { PriorityLanguage } from "./languages";

export interface LocaleMeta {
  language: string;
  version: number;
  status: "machine" | "partial" | "reviewed";
  reviewed: boolean;
  reviewedBy: string | null;
  updated: string;
  note: string;
  reviewedKeys?: string[];
}

export interface LocaleFile {
  _meta: LocaleMeta;
  strings: FlatDict;
}

const LOADERS: Record<PriorityLanguage, () => Promise<unknown>> = {
  vi: () => import("./locales/vi.json"),
  it: () => import("./locales/it.json"),
  tr: () => import("./locales/tr.json"),
  fa: () => import("./locales/fa.json"),
  hi: () => import("./locales/hi.json"),
};

export async function loadPriorityLanguage(lang: PriorityLanguage): Promise<LocaleFile> {
  const mod = (await LOADERS[lang]()) as { default?: LocaleFile } & LocaleFile;
  return mod.default ?? mod;
}
