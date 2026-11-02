import type { ReactNode } from "react";
import type { Tone } from "@/lib/ui/tone";
import { cx, PILL_CLASSES } from "./primitives";

export interface PillProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

/** Kleine Kennzeichnung (Turn, Tidy, VIP, Bleiber …), Höhe 28, Label/14. Figma `19:15`. Ton aus `src/lib/ui/pill-tone.ts`. */
export function Pill({ children, tone = "neutral", className }: PillProps) {
  return (
    <span className={cx("text-label inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-pill border px-3", PILL_CLASSES[tone], className)}>
      {children}
    </span>
  );
}
