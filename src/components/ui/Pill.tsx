import type { ReactNode } from "react";
import type { Tone } from "@/lib/ui/tone";
import { cx, PILL_CLASSES } from "./primitives";

export interface PillProps {
  children: ReactNode;
  tone?: Tone;
  /** Zweite Farbe als Rand links (Betrieb L2: Turn = blaue Pille mit rotem Rand). Nie die einzige Information. */
  edge?: Tone;
  className?: string;
}

/** Randfarbe einer zweifarbigen Pille — nur Token. */
const PILL_EDGE: Record<Tone, string> = {
  neutral: "border-s-4 border-s-pill-neutral-border",
  accent: "border-s-4 border-s-pill-gold-border",
  success: "border-s-4 border-s-status-success-fg",
  warning: "border-s-4 border-s-status-warning-fg",
  danger: "border-s-4 border-s-status-danger-fg",
  info: "border-s-4 border-s-status-info-fg",
};

/** Kleine Kennzeichnung (Turn, Tidy, VIP, Bleiber …), Höhe 28, Label/14. Figma `19:15`. Ton aus `src/lib/ui/pill-tone.ts`. */
export function Pill({ children, tone = "neutral", edge, className }: PillProps) {
  return (
    <span className={cx("text-label inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-pill border px-3", PILL_CLASSES[tone], edge && PILL_EDGE[edge], className)}>
      {children}
    </span>
  );
}
