"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Einheitlicher Schließen-Button für alle Fenster, Seitenleisten, Bilder und Meldungsfelder:
 * Symbol **und** Wort („✕ Schließen"), mindestens 44 px hoch, sichtbarer Fokus.
 */
export default function CloseButton({ onClick, label, className = "" }: { onClick: () => void; label?: string; className?: string }) {
  const { t } = useLocale();
  const text = label ?? t("common.close");
  return (
    <button type="button" onClick={onClick} aria-label={text} title={text}
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-3 text-sm font-medium text-charcoal hover:bg-parchment focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${className}`}>
      <span aria-hidden className="text-base leading-none">✕</span>
      <span className="hidden sm:inline">{text}</span>
    </button>
  );
}
