"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useEscapeKey } from "@/components/useEscapeKey";
import { cx } from "@/components/ui/primitives";
import { trapTab } from "./focusTrap";

export type OverlayPlacement = "sheet" | "inset" | "center";

/**
 * Fenster-Grundgerüst des neuen Designs (D1): Portal an <body> (die Hub-Seiten liegen in
 * transformierten Containern), abgedunkelter Hintergrund, Escape schließt, Fokus wird im Fenster
 * gehalten und beim Schließen zurückgegeben, Seite dahinter scrollt nicht.
 * - `sheet`: Bottom-Sheet von unten (Handy), ca. 70 % Höhe, Griff oben.
 * - `inset`: Einschub von rechts (Tablet 640–1279 px).
 * - `center`: Dialog in der Mitte.
 * Den sichtbaren Schließen-Knopf (t("common.close")) liefert der Inhalt (DetailContainer/GlassDialog).
 */
export function Overlay({
  placement,
  onClose,
  labelledBy,
  children,
  className,
  dismissOnBackdrop = true,
}: {
  placement: OverlayPlacement;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
  /** Formular mit Eingaben: Tipp auf den Hintergrund verwirft nicht (Kreuz und Escape schon). */
  dismissOnBackdrop?: boolean;
}) {
  const { t } = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEscapeKey(onClose, true);

  useEffect(() => {
    if (!mounted) return;
    const before = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const first = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root;
    first?.focus();
    const onKey = (e: KeyboardEvent) => root && trapTab(root, e);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      before?.focus?.();
    };
  }, [mounted]);

  if (!mounted) return null;

  const position =
    placement === "sheet"
      ? "items-end justify-center"
      : placement === "inset"
        ? "items-stretch justify-end p-2"
        : "items-center justify-center p-4";
  const motion = placement === "sheet" ? "animate-sheet-up" : placement === "inset" ? "animate-slide-in-end" : "animate-in-up";

  return createPortal(
    <div className={cx("theme-glass fixed inset-0 z-50 flex", position)}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("common.close")}
        onClick={() => dismissOnBackdrop && onClose()}
        className="absolute inset-0 cursor-default bg-bg-canvas/70"
      />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={cx("relative outline-none", motion, className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
