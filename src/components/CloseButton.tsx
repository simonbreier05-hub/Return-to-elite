"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { useGlassMode } from "@/components/shell/GlassMode";

/**
 * Einheitlicher Schließen-Button für alle Fenster, Seitenleisten, Bilder und Meldungsfelder:
 * Symbol **und** Wort („✕ Schließen"), mindestens 44 px hoch, sichtbarer Fokus.
 */
export default function CloseButton({ onClick, label, className = "" }: { onClick: () => void; label?: string; className?: string }) {
  const { t } = useLocale();
  const text = label ?? t("common.close");
  const glass = useGlassMode();
  const look = glass ? "glass rounded-(--glass-radius-md) text-text-primary focus-visible:outline-accent-text" : "rounded-lg border border-charcoal/15 bg-white text-charcoal hover:bg-parchment focus-visible:outline-gold";
  return (
    <button type="button" onClick={onClick} aria-label={text} title={text}
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 ${look} ${className}`}>
      <span aria-hidden className="text-base leading-none">✕</span>
      <span className="hidden sm:inline">{text}</span>
    </button>
  );
}
