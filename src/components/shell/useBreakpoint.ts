"use client";

import { useEffect, useState } from "react";

/** Breiten laut Spezifikation Abschnitt 10: < 640 Handy, 640–1279 Tablet (Icon-Leiste), ab 1280 breit (Seitenleiste). */
export type Breakpoint = "phone" | "tablet" | "wide";

export const BREAKPOINT_PX = { tablet: 640, wide: 1280 } as const;

export function breakpointFor(width: number): Breakpoint {
  if (width >= BREAKPOINT_PX.wide) return "wide";
  if (width >= BREAKPOINT_PX.tablet) return "tablet";
  return "phone";
}

/** Aktuelle Breite als Breakpoint; vor dem ersten Rendern im Browser `null` (Server kennt die Breite nicht). */
export function useBreakpoint(): Breakpoint | null {
  const [bp, setBp] = useState<Breakpoint | null>(null);
  useEffect(() => {
    const update = () => setBp(breakpointFor(window.innerWidth));
    update();
    const a = window.matchMedia(`(min-width: ${BREAKPOINT_PX.tablet}px)`);
    const b = window.matchMedia(`(min-width: ${BREAKPOINT_PX.wide}px)`);
    a.addEventListener("change", update);
    b.addEventListener("change", update);
    return () => {
      a.removeEventListener("change", update);
      b.removeEventListener("change", update);
    };
  }, []);
  return bp;
}
