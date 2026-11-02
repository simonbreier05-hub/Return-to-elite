import type { ReactNode } from "react";
import { cx } from "./primitives";

export interface GlassCardProps {
  children: ReactNode;
  /** Semantisches Element (Standard `div`). */
  as?: "div" | "section" | "article" | "aside";
  /** Innenabstand 24 px (Handy 16 px); `false` für eigene Abstände. */
  padded?: boolean;
  /** Ausgewählte Karte (Fill `--glass-selected`). */
  selected?: boolean;
  /** Warmer Lichtreflex (Handlungsbedarf). */
  warm?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** Karte mit Glas-Fill, Verlaufs-Rand und einem Schatten (Spezifikation Abschnitt 3). */
export function GlassCard({ children, as: Tag = "div", padded = true, selected, warm, className, ...aria }: GlassCardProps) {
  return (
    <Tag className={cx("glass rounded-(--glass-radius-lg)", selected && "glass-selected", warm && "glass-warm", padded && "p-4 sm:p-6", className)} {...aria}>
      {children}
    </Tag>
  );
}
