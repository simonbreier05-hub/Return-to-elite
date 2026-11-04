"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Glas-Modus (Design D3b): Seiten im Design „Glas & Premium“ (`AppShell legacy={false}`) setzen ihn für ihren Inhalt.
 * Gemeinsame alte Bausteine (Tageszahlen, Kacheln, Feed, Listen, Zuteil-Brett, Fenster) fragen ihn ab und zeichnen
 * sich dann mit Glas-Bausteinen — Logik, Daten und API-Wege bleiben dieselben. Ohne Provider (alte Seiten,
 * Planungstool mit eigenem Layout) bleibt alles wie bisher.
 */
const GlassModeContext = createContext(false);

export function GlassMode({ children, on = true }: { children: ReactNode; on?: boolean }) {
  return <GlassModeContext.Provider value={on}>{children}</GlassModeContext.Provider>;
}

export function useGlassMode(): boolean {
  return useContext(GlassModeContext);
}
