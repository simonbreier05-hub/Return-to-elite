"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translateGuest, isGuestLocale, pickGuestLocale, GUEST_RTL, type GuestLocale, type GuestTKey } from "./translations";

const STORAGE_KEY = "stayclean.guest.locale";

interface GuestLocaleContextValue {
  locale: GuestLocale;
  setLocale: (l: GuestLocale) => void;
  t: (key: GuestTKey, vars?: Record<string, string | number>) => string;
}

const GuestLocaleContext = createContext<GuestLocaleContextValue | null>(null);

/**
 * Guest screen language (Prompt G2 Teil 3): automatic detection with a
 * visible manual switch. Priority, highest first:
 *   1. A choice the guest already made on this device (localStorage).
 *   2. The stay's own language (Stay.language, set at booking/check-in —
 *      `initialLocale` prop, passed down from the resolved Stay server-side).
 *   3. The browser's language.
 *   4. German (the house's own working language), as the final fallback.
 * Runs client-side only (no server round-trip) — the server-resolved
 * `initialLocale` avoids a flash of the wrong language on first paint
 * without needing SSR cookie plumbing.
 */
export function GuestLocaleProvider({ initialLocale, children }: { initialLocale?: string | null; children: ReactNode }) {
  const [locale, setLocaleState] = useState<GuestLocale>(
    initialLocale && isGuestLocale(initialLocale) ? initialLocale : "en"
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && isGuestLocale(stored)) {
        setLocaleState(stored);
        return;
      }
    } catch {
      // Private browsing / storage disabled — fall through to detection.
    }
    // F7 (M14): Gerätesprache zuerst, dann Gastsprache aus Opera, Rückfall Englisch
    const langs = window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language ?? ""];
    setLocaleState(pickGuestLocale(langs, initialLocale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: GuestLocale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Private browsing / storage disabled — the choice just won't persist.
    }
  }, []);

  const value = useMemo<GuestLocaleContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translateGuest(locale, key, vars) }),
    [locale, setLocale]
  );

  // F7: Persisch rechts nach links; lang-Attribut für Vorlesefunktionen
  return (
    <GuestLocaleContext.Provider value={value}>
      <div lang={locale} dir={GUEST_RTL.includes(locale) ? "rtl" : "ltr"}>{children}</div>
    </GuestLocaleContext.Provider>
  );
}

export function useGuestLocale(): GuestLocaleContextValue {
  const ctx = useContext(GuestLocaleContext);
  if (!ctx) throw new Error("useGuestLocale() must be used within a GuestLocaleProvider");
  return ctx;
}
