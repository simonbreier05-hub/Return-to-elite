"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { GUEST_LOCALES } from "@/lib/guestI18n/translations";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/**
 * Visible DE/EN switcher (Prompt G2 Teil 3: "Umschalter sichtbar"), D6: two
 * FilterChips like Figma `41:2840` (active = champagne). Each chip is ≥ 48 px
 * tall (min-h-(--size-touch-min)) and reports its state via aria-pressed.
 */
export default function GuestLanguageSwitcher() {
  const { locale, setLocale, t } = useGuestLocale();

  return (
    <div className="flex shrink-0 gap-1" role="group" aria-label={t("language.label")}>
      {GUEST_LOCALES.map((l) => (
        <FilterChip key={l} active={locale === l} onClick={() => setLocale(l)} className="min-w-(--size-touch-min) px-5">
          <span lang={l}>{t(`language.${l}` as const)}</span>
        </FilterChip>
      ))}
    </div>
  );
}
