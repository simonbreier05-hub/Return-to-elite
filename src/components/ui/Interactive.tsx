/**
 * Klickbare Hülle der Design-Bausteine (Link, Button oder nur Anzeige). Eigene Datei, damit
 * `primitives.tsx` kein `next/link` mitzieht — Seiten, die nur Symbol/Fokusring/Töne brauchen
 * (z. B. der Gäste-Screen auf mobilen Daten), laden den Link-Code dann nicht mit.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cx, FOCUS_RING } from "./primitives";

export interface InteractiveProps {
  /** Ziel-Link (Seitenwechsel) … */
  href?: string;
  /** … oder Aktion. Ohne beides ist der Baustein nur Anzeige. */
  onClick?: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-current"?: "page" | "true" | boolean;
  "aria-pressed"?: boolean;
}

/** Hülle: Link, Button oder (ohne Aktion) div — mit Fokusring und Eindrück-Effekt. */
export function Interactive({
  href,
  onClick,
  disabled,
  className,
  children,
  ...aria
}: InteractiveProps & { className?: string; children: ReactNode }) {
  if (href && !disabled) {
    return (
      <Link href={href} className={cx("press", FOCUS_RING, className)} {...aria}>
        {children}
      </Link>
    );
  }
  if (onClick || disabled) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cx("press text-start", FOCUS_RING, className)} {...aria}>
        {children}
      </button>
    );
  }
  return (
    <div className={className} aria-label={aria["aria-label"]} aria-current={aria["aria-current"]}>
      {children}
    </div>
  );
}
