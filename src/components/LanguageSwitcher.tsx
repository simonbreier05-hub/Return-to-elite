"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import type { Locale } from "@/lib/i18n/translations";

const LOCALES: Locale[] = ["de", "en"];

/**
 * Persistent DE|EN toggle. Two adjacent buttons rather than a select — one
 * tap, no menu to open, and both states are visible at once so a new hire
 * never has to guess which language they're currently in.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div
      role="group"
      aria-label={t("appShell.language")}
      className={`inline-flex items-center gap-0.5 rounded-full border border-charcoal/15 bg-parchment/70 p-0.5 ${className}`}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`h-7 rounded-full px-2.5 text-[0.7rem] font-semibold uppercase tracking-wider transition ${
            locale === l ? "bg-navy text-ivory" : "text-graphite hover:bg-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
