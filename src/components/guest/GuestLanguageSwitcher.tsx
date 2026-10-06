"use client";

import { GUEST_LOCALES } from "@/lib/guestI18n/translations";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/** Visible DE/EN switcher (Prompt G2 Teil 3: "Umschalter sichtbar"). */
export default function GuestLanguageSwitcher() {
  const { locale, setLocale, t } = useGuestLocale();

  return (
    <div className="flex shrink-0 gap-1" role="group" aria-label="Language">
      {GUEST_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className="h-11 w-11 rounded-md text-xs font-semibold tracking-wide transition"
          style={
            locale === l
              ? { background: "var(--g-navy)", color: "white" }
              : { background: "var(--g-panel)", color: "var(--g-muted)" }
          }
        >
          {t(`language.${l}` as const)}
        </button>
      ))}
    </div>
  );
}
