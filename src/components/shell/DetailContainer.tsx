"use client";

import { useId, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useEscapeKey } from "@/components/useEscapeKey";
import { cx } from "@/components/ui/primitives";
import { GlassIconButton } from "./GlassIconButton";
import { Overlay } from "./Overlay";
import { useBreakpoint, type Breakpoint } from "./useBreakpoint";

export interface DetailContainerProps {
  /** Offen? Geschlossen rendert der Container nichts. */
  open: boolean;
  onClose: () => void;
  /** Überschrift (Title/28), z. B. „Zimmer 305“. */
  title: string;
  children: ReactNode;
  /** Unten fest stehender Bereich, z. B. der Hauptknopf. */
  footer?: ReactNode;
  /** Formular mit Eingaben: Tipp daneben verwirft nicht. */
  dirty?: boolean;
  /** Nur für Tests/Styleguide: Darstellung erzwingen statt nach Breite. */
  forceMode?: Breakpoint;
  className?: string;
}

/**
 * Ein Detail-Baustein für alle Breiten (Spezifikation Abschnitt 10):
 * - ab 1280 px Panel rechts neben der Liste (im Seitenfluss, Glas-Karte 348 px, Figma `22:67`),
 * - 640–1279 px Einschub von rechts über dem Inhalt (Figma `22:449`),
 * - unter 640 px Bottom-Sheet von unten, ca. 70 % Höhe, mit Griff (Figma `41:2140`).
 * Schließen mit Kreuz und Escape; Einschub/Sheet fangen den Fokus und geben ihn zurück.
 * Inhalt kommt als Kinder — der Container kennt keine Daten.
 */
export function DetailContainer({ open, onClose, title, children, footer, dirty, forceMode, className }: DetailContainerProps) {
  const { t } = useLocale();
  const id = useId();
  const detected = useBreakpoint();
  const mode = forceMode ?? detected;
  // Breites Panel liegt im Seitenfluss (kein Fenster): Escape schließt es trotzdem, egal wo der Fokus steht.
  useEscapeKey(onClose, open && mode === "wide");
  if (!open || !mode) return null;

  const head = (
    <div className="flex items-center gap-3">
      <h2 id={`${id}-title`} className="text-title-28 min-w-0 flex-1 truncate text-text-primary">
        {title}
      </h2>
      <GlassIconButton icon="x" label={t("common.close")} onClick={onClose} />
    </div>
  );
  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="pt-4">{footer}</div>}
    </>
  );

  if (mode === "wide") {
    return (
      <aside
        aria-labelledby={`${id}-title`}
        className={cx("glass animate-in-up sticky top-4 flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 rounded-(--glass-radius-lg) p-6", className)}
      >
        {head}
        {body}
      </aside>
    );
  }

  if (mode === "tablet") {
    return (
      <Overlay placement="inset" onClose={onClose} labelledBy={`${id}-title`} dismissOnBackdrop={!dirty} className="flex h-full w-[min(348px,calc(100vw-1rem))]">
        <div className={cx("glass flex h-full w-full flex-col gap-4 rounded-(--glass-radius-lg) p-6", className)}>
          {head}
          {body}
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay placement="sheet" onClose={onClose} labelledBy={`${id}-title`} dismissOnBackdrop={!dirty} className="w-full">
      <div
        className={cx(
          "glass flex h-[71dvh] w-full flex-col gap-4 rounded-t-(--glass-radius-xl) rounded-b-none px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        <span aria-hidden="true" className="mx-auto h-[5px] w-11 shrink-0 rounded-pill bg-surface-progress-track" />
        {head}
        {body}
      </div>
    </Overlay>
  );
}
