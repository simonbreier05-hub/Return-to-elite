"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translateGuest, isGuestLocale, type GuestLocale, type GuestTKey } from "./translations";

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
    initialLocale && isGuestLocale(initialLocale) ? initialLocale : "de"
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
    if (initialLocale && isGuestLocale(initialLocale)) return; // server already knew the stay's language
    const browserLang = window.navigator.language?.slice(0, 2).toLowerCase();
    if (browserLang && isGuestLocale(browserLang)) setLocaleState(browserLang);
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

  return <GuestLocaleContext.Provider value={value}>{children}</GuestLocaleContext.Provider>;
}

export function useGuestLocale(): GuestLocaleContextValue {
  const ctx = useContext(GuestLocaleContext);
  if (!ctx) throw new Error("useGuestLocale() must be used within a GuestLocaleProvider");
  return ctx;
}
