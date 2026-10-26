"use client";

import { useCallback, useState } from "react";

/** Menge offener Einträge (aufgeklappte Listen), bleibt über Neuladen der Daten, Reiterwechsel und Seitenwechsel erhalten (sessionStorage). */
export function usePersistedSet(key: string): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(() => {
    try { const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null; return new Set(raw ? (JSON.parse(raw) as string[]) : []); }
    catch { return new Set(); }
  });
  const toggle = useCallback((id: string) => setSet((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { window.sessionStorage.setItem(key, JSON.stringify([...next])); } catch { /* Speicher gesperrt — Zustand gilt nur für diese Sitzung der Seite */ }
    return next;
  }), [key]);
  return [set, toggle];
}
