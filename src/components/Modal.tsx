"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Shared modal frame. Bottom sheet on phones, centred dialog from `sm` up,
 * with touch targets sized for gloved hands on a tablet.
 *
 * This replaces the browser's window.prompt()/confirm(), which cannot be
 * styled, is easy to mis-tap, and looks out of place in the housekeeping UI.
 *
 * Closing plays a fade+scale-out before the parent actually unmounts this
 * component — a plain conditional render has no way to animate its own
 * removal, so `close()` holds it on screen for one motion duration first.
 */
const CLOSE_MS = 220; // keep in sync with --duration-base in globals.css

export default function Modal({
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
  const { t } = useLocale();
  const [closing, setClosing] = useState(false);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-charcoal/50 p-0 sm:items-center sm:p-4 ${
        closing ? "animate-overlay-out" : "animate-overlay"
      }`}
      onClick={close}
    >
      <div
        className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-linen p-5 shadow-2xl sm:rounded-2xl ${
          closing ? "animate-sheet-out" : "animate-sheet"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl leading-tight text-navy">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-graphite">{subtitle}</p>}
          </div>
          <button
            onClick={close}
            aria-label={t("common.close")}
            className="-mr-1 -mt-1 h-11 w-11 shrink-0 rounded-lg text-lg hover:bg-parchment"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
