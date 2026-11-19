"use client";

import { GUEST_LOCALES, isGuestLocale } from "@/lib/guestI18n/translations";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/** Sprachname in der eigenen Sprache — so findet jeder Gast seine Sprache, auch ohne die aktuelle zu verstehen. */
const NATIVE: Record<(typeof GUEST_LOCALES)[number], string> = {
  de: "Deutsch", en: "English", it: "Italiano", tr: "Türkçe", fa: "فارسی", hi: "हिन्दी", vi: "Tiếng Việt",
};

/**
 * Sichtbarer Sprachumschalter (Prompt G2 Teil 3, F7: sieben Sprachen wie die App). Eine Auswahlliste statt sieben Chips,
 * damit es auf dem Handy nicht überläuft; ≥ 48 px hoch. Die Wahl bleibt auf dem Gerät gespeichert.
 */
export default function GuestLanguageSwitcher() {
  const { locale, setLocale, t } = useGuestLocale();
  return (
    <label className="flex shrink-0 items-center gap-2">
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(e) => { if (isGuestLocale(e.target.value)) setLocale(e.target.value); }}
        className="text-body-16 min-h-(--size-touch-min) rounded-full border border-border-subtle bg-surface-card-raised px-4 text-text-primary"
        data-testid="guest-language"
      >
        {GUEST_LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>{NATIVE[l]}</option>
        ))}
      </select>
    </label>
  );
}
