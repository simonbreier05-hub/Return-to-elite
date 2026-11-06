"use client";

import { useEffect, useRef } from "react";

/**
 * Offene Escape-Empfänger, das zuletzt geöffnete Fenster zuletzt. Ein Tastendruck geht nur an das oberste.
 * (Früher hörte jedes Fenster selbst auf `window` und meldete sich bei jedem Neuzeichnen neu an: lag ein Fenster
 * über einem Detail-Panel, schloss das erste Escape das Panel darunter, und das Fenster verpasste den Tastendruck.)
 */
const stack: { current: () => void }[] = [];
let listening = false;
const onKey = (e: KeyboardEvent) => {
  if (e.key !== "Escape" || stack.length === 0) return;
  e.stopPropagation();
  stack[stack.length - 1].current();
};

/** Esc schließt das oberste Fenster. Nur aktiv, solange `active` wahr ist (z. B. solange ein Fenster offen ist). */
export function useEscapeKey(onEscape: () => void, active = true) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    if (!listening) { window.addEventListener("keydown", onKey); listening = true; }
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0 && listening) { window.removeEventListener("keydown", onKey); listening = false; }
    };
  }, [active]);
}
