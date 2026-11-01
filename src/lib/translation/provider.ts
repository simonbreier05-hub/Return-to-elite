/**
 * TranslationProvider — die eine Anbieter-Schnittstelle für maschinelle Übersetzung (Prompt K1, vorbereitet für K2).
 *
 * K1 nutzt sie nur für Oberflächentexte (keine Personen- oder Gastdaten). Welcher Anbieter (DeepL, Google, KI-Modell …)
 * dahinter steht, entscheidet K2 — bis dahin ist keiner aktiv und Sprachen ohne eigene Datei zeigen Englisch.
 *
 * Aktivierung nur über Umgebungsvariablen (`TRANSLATION_PROVIDER=<id>` + anbieterspezifische Zugangsdaten),
 * nie im Code. Ein Anbieter registriert sich mit `registerTranslationProvider()`.
 */

export interface TranslationRequest {
  /** Texte in der Quellsprache; Antwort in derselben Reihenfolge. Marker `⟦n⟧` müssen unverändert bleiben. */
  texts: string[];
  source: string;
  target: string;
  /** Feste Begriffe (Quelle → Ziel). Anbieter mit eigener Glossar-Funktion dürfen sie zusätzlich nutzen. */
  glossary: { source: string; target: string }[];
  /** "ui" = Oberflächentexte (K1); "content" = Inhalte (K2). */
  purpose: "ui" | "content";
}

export interface TranslationProvider {
  readonly id: string;
  translate(req: TranslationRequest, opts?: { signal?: AbortSignal }): Promise<string[]>;
}

type Factory = () => TranslationProvider | null;
const registry = new Map<string, Factory>();
let override: TranslationProvider | null | undefined;

export function registerTranslationProvider(id: string, factory: Factory): void {
  registry.set(id, factory);
}

/** Aktiver Anbieter oder null (nicht konfiguriert). */
export function getTranslationProvider(): TranslationProvider | null {
  if (override !== undefined) return override;
  const id = process.env.TRANSLATION_PROVIDER?.trim();
  if (!id || id === "none") return null;
  return registry.get(id)?.() ?? null;
}

/** Nur für Tests: Anbieter fest setzen (`undefined` = wieder aus der Umgebung lesen). */
export function setTranslationProviderForTests(p: TranslationProvider | null | undefined): void {
  override = p;
}
