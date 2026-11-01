/**
 * Laufzeit-Übersetzung der Oberfläche für Sprachen ohne eigene Datei (Prompt K1, Stufe 2).
 *
 * Quelle ist Deutsch; Glossar und Platzhalter werden vor dem Anbieter-Aufruf geschützt (`protect`) und danach
 * wieder eingesetzt. Ergebnis je Sprache + Schlüssel in `UiTranslation` zwischengespeichert; neu übersetzt wird
 * nur, wenn sich der deutsche Text geändert hat (sourceHash). Fehler/kein Anbieter → leere Antwort, der Client
 * fällt auf Englisch, dann Deutsch zurück. Es gehen ausschließlich Oberflächentexte an den Anbieter.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { SOURCE_DICTS, type FlatDict } from "./core";
import { protect, restore, glossaryFor } from "./glossary";
import { languageTier, normalizeLanguage, SOURCE_LANGUAGE } from "./languages";
import { getTranslationProvider, type TranslationProvider } from "@/lib/translation/provider";

const CHUNK = 50;
const TIMEOUT_MS = 20_000;

export const sourceHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export interface RuntimeBundle {
  lang: string;
  strings: FlatDict;
  /** Anzahl Schlüssel, die (noch) fehlen — sie zeigt der Client auf Englisch. */
  missing: number;
  provider: string | null;
  machine: true;
}

const inflight = new Map<string, Promise<RuntimeBundle>>();

/** Übersetzt einen Block; jeder Text, dessen Marker verloren gingen, wird verworfen (→ Fallback). */
async function translateChunk(provider: TranslationProvider, lang: string, entries: [string, string][]): Promise<[string, string][]> {
  const prepared = entries.map(([key, text]) => ({ key, ...protect(text, lang) }));
  const result = await provider.translate(
    { texts: prepared.map((p) => p.text), source: SOURCE_LANGUAGE, target: lang, glossary: glossaryFor(lang), purpose: "ui" },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  const out: [string, string][] = [];
  prepared.forEach((p, i) => {
    const restored = typeof result[i] === "string" ? restore(result[i], p.tokens) : null;
    if (restored && restored.trim()) out.push([p.key, restored]);
  });
  return out;
}

async function build(lang: string, provider: TranslationProvider | null): Promise<RuntimeBundle> {
  const rows = await prisma.uiTranslation.findMany({ where: { lang } });
  const cached = new Map(rows.map((r) => [r.key, r]));
  const strings: FlatDict = {};
  const todo: [string, string][] = [];
  for (const [key, text] of Object.entries(SOURCE_DICTS.de)) {
    const row = cached.get(key);
    if (row && row.sourceHash === sourceHash(text)) strings[key] = row.text;
    else todo.push([key, text]);
  }
  if (provider && todo.length) {
    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      let done: [string, string][];
      try {
        done = await translateChunk(provider, lang, chunk);
      } catch {
        // Anbieter nicht erreichbar/Zeitüberschreitung: Rest bleibt Englisch, nächster Aufruf versucht es erneut.
        // Kein Text im Log (Datenschutz-Regel aus K2 gilt hier schon).
        console.warn(`[i18n] Laufzeit-Übersetzung ${lang} abgebrochen (${provider.id})`);
        break;
      }
      for (const [key, text] of done) strings[key] = text;
      // ein Block = eine Transaktion (schneller als Einzel-Schreiben, nie halbe Blöcke)
      await prisma.$transaction(
        done.map(([key, text]) => {
          const hash = sourceHash(SOURCE_DICTS.de[key]);
          return prisma.uiTranslation.upsert({
            where: { lang_key: { lang, key } },
            create: { lang, key, text, sourceHash: hash, provider: provider.id },
            update: { text, sourceHash: hash, provider: provider.id },
          });
        }),
      );
    }
  }
  return { lang, strings, missing: Object.keys(SOURCE_DICTS.de).length - Object.keys(strings).length, provider: provider?.id ?? null, machine: true };
}

/** Bündel für eine Laufzeit-Sprache; null für de/en/Prioritätssprachen (die kommen aus Dateien) oder ungültige Codes. */
export async function getRuntimeBundle(rawLang: string): Promise<RuntimeBundle | null> {
  const lang = normalizeLanguage(rawLang);
  if (!lang || languageTier(lang) !== "runtime") return null;
  const running = inflight.get(lang);
  if (running) return running;
  const p = build(lang, getTranslationProvider()).finally(() => inflight.delete(lang));
  inflight.set(lang, p);
  return p;
}
