/**
 * Fachglossar (Prompt K1): feste Hotel-Begriffe, die nicht frei übersetzt werden dürfen.
 *
 * - `fixed`: in jeder Sprache gleich (z. B. „DND“, „Credits“) — wird auch bei maschinell übersetzten
 *   Sprachen ohne eigenen Eintrag geschützt. Supervisor/Duty Manager sind nicht `fixed`: auf Persisch/Hindi
 *   in der jeweiligen Schrift umschrieben, sonst lateinisch.
 * - sonst je Sprache ein Eintrag; Sprachen ohne Eintrag übersetzt der Anbieter frei.
 * - `de`: alle deutschen Formen, die im Quelltext vorkommen (Plural/Fälle) — Treffer nur als ganzes Wort.
 *
 * Muttersprachler korrigieren hier, nicht in den Sprachdateien: der Test
 * `tests/i18n/glossary.test.ts` prüft, dass die Prioritäts-Sprachdateien diese Begriffe verwenden.
 * `reviewed` listet die Sprachen, in denen ein Muttersprachler den Begriff bestätigt hat.
 */

export interface GlossaryTerm {
  id: string;
  de: string[];
  en: string;
  fixed?: boolean;
  /** Zielbegriff je Sprache (Basiscode). Bei `fixed` leer. */
  t?: Record<string, string>;
  reviewed?: string[];
  /** Weitere zulässige Formen in der Zielsprache (z. B. Mehrzahl „Partenze“) — nur für die Prüfung der Sprachdateien. */
  alt?: Record<string, string[]>;
}

export const GLOSSARY: GlossaryTerm[] = [
  { id: "departure", de: ["Abreise", "Abreisen"], en: "Departure", t: { vi: "Check-out", it: "Partenza", tr: "Çıkış", fa: "خروج", hi: "चेक-आउट" }, alt: { it: ["Partenze"] } },
  { id: "arrival", de: ["Anreise", "Anreisen"], en: "Arrival", t: { vi: "Check-in", it: "Arrivo", tr: "Giriş", fa: "ورود", hi: "चेक-इन" }, alt: { it: ["Arrivi"] } },
  { id: "stayover", de: ["Bleiber", "Bleibern", "Bleibers"], en: "Stayover", t: { vi: "Phòng ở tiếp", it: "Fermata", tr: "Konaklayan", fa: "ماندگار", hi: "स्टेओवर" }, alt: { it: ["Fermate"] } },
  { id: "linenChange", de: ["Wäschewechsel"], en: "Linen change", t: { vi: "Thay đồ vải", it: "Cambio biancheria", tr: "Çarşaf değişimi", fa: "تعویض ملحفه", hi: "लिनेन बदलना" } },
  { id: "tidy", de: ["Tidy"], en: "Tidy", fixed: true },
  { id: "credits", de: ["Credits"], en: "Credits", fixed: true },
  { id: "trace", de: ["Trace", "Traces"], en: "Trace", fixed: true },
  { id: "dnd", de: ["DND"], en: "DND", fixed: true },
  { id: "turn", de: ["Turn"], en: "Turn", fixed: true },
  { id: "release", de: ["Freigabe", "Freigaben"], en: "Release", t: { vi: "Duyệt phòng", it: "Rilascio", tr: "Onay", fa: "تأیید", hi: "रिलीज़" } },
  { id: "rework", de: ["Nachbessern"], en: "Rework", t: { vi: "Làm lại", it: "Ripasso", tr: "Düzeltme", fa: "اصلاح", hi: "सुधार" } },
  { id: "roomStatus", de: ["Zimmerstatus"], en: "Room status", t: { vi: "Trạng thái phòng", it: "Stato camera", tr: "Oda durumu", fa: "وضعیت اتاق", hi: "कमरे की स्थिति" } },
  { id: "floor", de: ["Etage", "Etagen"], en: "Floor", t: { vi: "Tầng", it: "Piano", tr: "Kat", fa: "طبقه", hi: "मंज़िल" }, alt: { it: ["Piani"] } },
  { id: "houseman", de: ["Hausmann", "Hausmänner"], en: "Houseman", t: { vi: "Houseman", it: "Houseman", tr: "Houseman", fa: "هاوس‌من", hi: "हाउसमैन" } },
  { id: "supervisor", de: ["Supervisor", "Supervisoren", "Supervisorin"], en: "Supervisor", t: { vi: "Supervisor", it: "Supervisor", tr: "Supervisor", fa: "سوپروایزر", hi: "सुपरवाइज़र" } },
  { id: "dutyManager", de: ["Duty Manager"], en: "Duty Manager", t: { vi: "Duty Manager", it: "Duty Manager", tr: "Duty Manager", fa: "دیوتی منیجر", hi: "ड्यूटी मैनेजर" } },
  { id: "engineering", de: ["Technik"], en: "Engineering", t: { vi: "Kỹ thuật", it: "Manutenzione", tr: "Teknik", fa: "فنی", hi: "तकनीकी" } },
  { id: "defect", de: ["Mangel", "Mängel", "Mangels"], en: "Defect", t: { vi: "Hư hỏng", it: "Guasto", tr: "Arıza", fa: "خرابی", hi: "ख़राबी" }, alt: { it: ["Guasti"] } },
];

/** Zielbegriff eines Eintrags für `lang`; null = frei übersetzen. */
export function glossaryTarget(term: GlossaryTerm, lang: string): string | null {
  if (term.fixed) return term.en;
  if (lang === "de") return term.de[0];
  if (lang === "en") return term.en;
  return term.t?.[lang] ?? null;
}

/** Einträge, die für `lang` gelten (Quelle → Ziel), z. B. für Anbieter mit eigener Glossar-Funktion. */
export function glossaryFor(lang: string): { source: string; target: string; id: string }[] {
  const out: { source: string; target: string; id: string }[] = [];
  for (const term of GLOSSARY) {
    const target = glossaryTarget(term, lang);
    if (target) for (const source of term.de) out.push({ id: term.id, source, target });
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wortgrenzen-Regex für alle deutschen Formen (längste zuerst, damit „Abreisen“ vor „Abreise“ greift). */
export function termRegex(term: GlossaryTerm): RegExp {
  const forms = [...term.de].sort((a, b) => b.length - a.length).map(escape).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms})(?![\\p{L}\\p{N}])`, "gu");
}

export interface Protected {
  text: string;
  tokens: string[];
}

/**
 * Vor der maschinellen Übersetzung: Platzhalter `{{x}}` und Glossar-Begriffe durch Marker `⟦n⟧` ersetzen,
 * damit der Anbieter sie nicht verändert. `restore` setzt danach die Zielbegriffe ein.
 */
export function protect(text: string, target: string): Protected {
  const tokens: string[] = [];
  const mark = (value: string) => {
    tokens.push(value);
    return `⟦${tokens.length - 1}⟧`;
  };
  let out = text.replace(/\{\{\s*\w+\s*\}\}/g, (m) => mark(m));
  for (const term of GLOSSARY) {
    const repl = glossaryTarget(term, target);
    if (!repl) continue;
    out = out.replace(termRegex(term), () => mark(repl));
  }
  return { text: out, tokens };
}

/** Marker zurücksetzen. Fehlt ein Marker in der Übersetzung → null (Aufrufer fällt auf Englisch zurück). */
export function restore(translated: string, tokens: string[]): string | null {
  const seen = new Set<number>();
  const out = translated.replace(/⟦\s*(\d+)\s*⟧/g, (m, n) => {
    const i = Number(n);
    if (i >= tokens.length) return m;
    seen.add(i);
    return tokens[i];
  });
  return seen.size === tokens.length ? out : null;
}
