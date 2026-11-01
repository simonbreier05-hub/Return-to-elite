"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CloseButton from "./CloseButton";
import ErrorBoundary from "./ErrorBoundary";
import { useEscapeKey } from "./useEscapeKey";

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
 *
 * Always rendered through a portal into <body>: the hub pages sit inside an
 * animated container (`.animate-rise`, a CSS transform). A `position: fixed`
 * element inside a transformed ancestor is positioned against that ancestor,
 * not the screen — on a long room list the sheet then lands far below the
 * visible area and only the grey backdrop shows (Housekeeper DND/Mangel bug).
 *
 * `dirty`: the form already holds input — a tap on the backdrop then does not
 * discard it (close button and Esc still work).
 */
const CLOSE_MS = 220; // keep in sync with --duration-base in globals.css

export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  dirty = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  dirty?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  };
  useEscapeKey(close, !closing);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-charcoal/50 p-0 sm:items-center sm:p-4 ${
        closing ? "animate-overlay-out" : "animate-overlay"
      }`}
      onClick={() => {
        if (!dirty) close();
      }}
      data-testid="modal-backdrop"
    >
      <div
        className={`modal-sheet w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-linen px-5 pt-0 shadow-2xl sm:rounded-2xl ${
          closing ? "animate-sheet-out" : "animate-sheet"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Kopf bleibt beim Scrollen stehen, damit „Schließen“ immer erreichbar ist. */}
        <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-start justify-between gap-3 bg-linen px-5 pt-5 pb-2">
          <div className="min-w-0">
            <h3 className="font-serif text-2xl leading-tight text-navy">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-graphite">{subtitle}</p>}
          </div>
          <CloseButton onClick={close} />
        </div>
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>,
    document.body,
  );
}
