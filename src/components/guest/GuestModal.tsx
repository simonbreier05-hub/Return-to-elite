"use client";

import { useEffect, useRef, useState } from "react";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";
import { useEscapeKey } from "@/components/useEscapeKey";
import { Glyph, FOCUS_RING } from "@/components/ui/primitives";

/**
 * Guest-screen modal frame (D6 „Glas & Premium“) — deliberately NOT the
 * staff Hub's Modal/GlassDialog: those read their close label from the
 * staff LocaleProvider. Here the label comes from the guest's own DE/EN
 * dictionary. Glass sheet (no blur, one shadow), close = symbol + word,
 * ≥ 48 px, Escape closes, Tab stays inside (focus trap), focus returns to
 * the element that opened it.
 */
const CLOSE_MS = 220; // keep in sync with --duration-base in globals.css

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function GuestModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useGuestLocale();
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };
  useEscapeKey(close, !closing);

  // Fokus hinein beim Öffnen, zurück zum Auslöser beim Schließen.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("[autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => opener?.focus?.();
  }, []);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-bg-canvas/80 p-0 sm:items-center sm:p-4 ${
        closing ? "animate-overlay-out" : "animate-overlay"
      }`}
      onClick={close}
    >
      <div
        ref={panel}
        className={`glass max-h-[92vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-(--glass-radius-lg) ${
          closing ? "animate-sheet-out" : "animate-sheet"
        }`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="guest-modal-title" className="text-title-22 text-text-primary">
              {title}
            </h2>
            {subtitle && <p className="text-body-16 mt-1 text-text-secondary">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("common.close")}
            className={`press text-label -me-1 -mt-1 inline-flex min-h-(--size-touch-min) shrink-0 items-center gap-1.5 rounded-pill border border-border-subtle px-4 text-text-primary ${FOCUS_RING}`}
          >
            <Glyph name="x" size={20} />
            <span>{t("common.close")}</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
