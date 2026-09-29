"use client";

import { useState } from "react";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/**
 * Guest-screen modal frame — a copy of src/components/Modal.tsx (same
 * bottom-sheet/centred-dialog behaviour and animation), not a reuse of it:
 * that one is styled in the staff Hub's ivory/gold palette and reads its
 * close-button label from the staff LocaleProvider, neither of which
 * belongs on the guest screen's own navy/brass/cream design system and
 * DE/EN locale (Prompt G2 Teil 3).
 */
const CLOSE_MS = 220; // keep in sync with --duration-base in globals.css

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

  const close = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 ${
        closing ? "animate-overlay-out" : "animate-overlay"
      }`}
      onClick={close}
    >
      <div
        className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl ${
          closing ? "animate-sheet-out" : "animate-sheet"
        }`}
        style={{ background: "white" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl leading-tight" style={{ color: "var(--g-navy)" }}>
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-sm" style={{ color: "var(--g-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={close}
            aria-label={t("common.close")}
            className="-mr-1 -mt-1 h-11 w-11 shrink-0 rounded-lg text-lg hover:bg-black/5"
            style={{ color: "var(--g-navy)" }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
