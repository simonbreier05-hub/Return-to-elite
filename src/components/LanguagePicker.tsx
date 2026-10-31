"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "./Modal";
import { useLocale, type LanguageQuality } from "@/lib/i18n/LocaleContext";
import { ALL_LANGUAGE_CODES, autonym, languageNameIn, languageTier, PRIORITY_LANGUAGES } from "@/lib/i18n/languages";
import type { TKey } from "@/lib/i18n/translations";

/** Kleinschreibung ohne Akzente/Diakritika, für die Suche. */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();

/** Kennzeichnung je Sprache in der Liste (unabhängig davon, ob sie gerade geladen ist). */
function tierLabel(code: string): TKey {
  const tier = languageTier(code);
  if (tier === "builtin") return "language.tierComplete";
  if (tier === "priority") return "language.tierUnreviewed";
  return "language.tierMachine";
}

const QUALITY_BADGE: Partial<Record<LanguageQuality, TKey>> = {
  unreviewed: "language.badgeUnreviewed",
  machine: "language.badgeMachine",
  fallback: "language.badgeFallback",
};

/** Kleine Kennzeichnung „maschinell übersetzt“ / „nicht muttersprachlich geprüft“ für die aktuelle Sprache. */
export function LanguageQualityBadge({ className = "" }: { className?: string }) {
  const { quality, t } = useLocale();
  const key = QUALITY_BADGE[quality];
  if (!key) return null;
  return <span className={`rounded-full bg-gold/10 px-2 py-0.5 text-[0.65rem] font-medium text-gold-soft ${className}`}>{t(key)}</span>;
}

/**
 * Sprachauswahl (Prompt K1): alle Sprachen, jede in ihrer eigenen Sprache benannt, mit Suchfeld (findet auch den Namen
 * in der aktuellen Sprache und den Code), keine Flaggen. Auswahl wirkt sofort und wird am Nutzer gespeichert.
 */
export function LanguagePickerModal({ onClose }: { onClose: () => void }) {
  const { locale, setLocale, t } = useLocale();
  const [q, setQ] = useState("");

  const all = useMemo(() => {
    const order = (c: string) => (c === "de" ? 0 : c === "en" ? 1 : (PRIORITY_LANGUAGES as readonly string[]).includes(c) ? 2 : 3);
    return [...ALL_LANGUAGE_CODES]
      .map((code) => {
        const own = autonym(code);
        const local = languageNameIn(code, locale);
        // Suche über Eigenname, Name in der Oberflächensprache, englischen Namen und Code — ohne Akzente („viet“ → „Tiếng Việt“)
        return { code, own, local, hay: fold([own, local, languageNameIn(code, "en"), code].join(" ")) };
      })
      .filter((l) => l.own !== l.code || l.code === locale)
      .sort((a, b) => order(a.code) - order(b.code) || a.local.localeCompare(b.local, locale));
  }, [locale]);

  const needle = fold(q.trim());
  const shown = needle ? all.filter((l) => l.hay.includes(needle)) : all;

  return (
    <Modal title={t("language.title")} subtitle={t("language.subtitle")} onClose={onClose}>
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("language.search")}
        aria-label={t("language.search")}
        className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-3 text-base outline-none focus:border-gold"
      />
      <ul role="listbox" aria-label={t("language.title")} className="max-h-[55vh] overflow-y-auto">
        {shown.map((l) => {
          const active = l.code === locale;
          return (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLocale(l.code);
                  onClose();
                }}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition hover:bg-parchment ${active ? "bg-parchment" : ""}`}
              >
                <span className="min-w-0">
                  <span lang={l.code} dir="auto" className="block truncate text-base font-medium text-charcoal">{l.own}</span>
                  {l.local !== l.own && <span className="block truncate text-xs text-graphite">{l.local}</span>}
                </span>
                <span className="shrink-0 text-end text-[0.65rem] text-graphite/80">
                  {active ? <span className="font-semibold text-gold-soft">✓ {t("language.current")}</span> : t(tierLabel(l.code))}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="p-3 text-sm text-graphite/70">{t("language.noResults")}</li>}
      </ul>
    </Modal>
  );
}

/** Knopf im Kopf/Login: aktuelle Sprache (Code + Name), öffnet die Auswahl. Ersetzt den alten DE/EN-Umschalter. */
export default function LanguageButton({ className = "" }: { className?: string }) {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const name = autonym(locale);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("language.change", { lang: name })}
        title={t("language.change", { lang: name })}
        className={`inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-charcoal/15 bg-parchment/70 px-3 text-xs font-semibold text-charcoal transition hover:bg-white ${className}`}
      >
        <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
        </svg>
        <span className="uppercase tracking-wider">{locale}</span>
      </button>
      {/* Portal: der Knopf sitzt mobil im Meldungs-Panel (transformiert) — sonst würde das Fenster darin festkleben */}
      {open && createPortal(<LanguagePickerModal onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** Beim ersten Login: Vorschlag aus der Browser-Sprache (nur wenn der Nutzer noch nie gewählt hat). */
export function LanguageSuggestion() {
  const { suggestion, setLocale, dismissSuggestion, locale, t } = useLocale();
  const [picker, setPicker] = useState(false);
  if (!suggestion && !picker) return null;
  if (picker) return <LanguagePickerModal onClose={() => setPicker(false)} />;
  if (!suggestion) return null;
  const sugName = autonym(suggestion);
  const sameAsCurrent = suggestion === locale;
  return (
    <div role="status" className="mx-auto mt-3 flex w-full max-w-7xl flex-wrap items-center gap-2 rounded-xl border border-gold-line/40 bg-parchment px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        {sameAsCurrent ? t("language.suggestConfirm", { lang: sugName }) : t("language.suggest", { lang: sugName })}
      </span>
      <button type="button" onClick={() => setLocale(suggestion)} className="tap h-11 rounded-lg bg-navy px-4 font-semibold text-ivory">
        {sameAsCurrent ? t("language.keep", { lang: sugName }) : t("language.useIt", { lang: sugName })}
      </button>
      {!sameAsCurrent && (
        <button type="button" onClick={dismissSuggestion} className="tap h-11 rounded-lg border border-charcoal/15 px-4">
          {t("language.stay", { lang: autonym(locale) })}
        </button>
      )}
      <button type="button" onClick={() => setPicker(true)} className="tap h-11 rounded-lg px-3 text-gold-soft underline-offset-2 hover:underline">
        {t("language.other")}
      </button>
    </div>
  );
}
