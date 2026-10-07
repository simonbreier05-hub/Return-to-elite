"use client";

import { useEffect } from "react";

/** Esc schließt das oberste Fenster. Nur aktiv, solange `active` wahr ist (z. B. solange ein Fenster offen ist). */
export function useEscapeKey(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onEscape(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, active]);
}
