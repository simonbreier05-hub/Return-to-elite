"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Locale, type TKey } from "./translations";

const STORAGE_KEY = "stayclean.locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * App-wide language state. Defaults to German (the house's own working
 * language) and persists the visitor's choice in localStorage — a supervisor
 * who switches to EN once should not have to switch again on every device
 * reload. No server round-trip: this is purely a client-side display
 * concern, so it stays a plain context rather than cookies/SSR plumbing.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("de");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "en") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Private browsing / storage disabled — the choice just won't persist.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale() must be used within a LocaleProvider");
  return ctx;
}
