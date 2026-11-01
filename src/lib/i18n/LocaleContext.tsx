"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TKey } from "./translations";
import { translateKey, type FlatDict, type Vars } from "./core";
import { browserLanguage, dirFor, intlLocale, isPriorityLanguage, languageTier, normalizeLanguage } from "./languages";
import { loadPriorityLanguage, type LocaleMeta } from "./bundles";
import { formatDate, formatDateTime, formatNumber, formatTime, setActiveLanguage } from "./format";

const STORAGE_KEY = "stayclean.locale";
const SUGGEST_KEY = "stayclean.langSuggestDone";

/** Wie verlässlich die aktuelle Sprache ist — steuert die Kennzeichnung im UI. */
export type LanguageQuality = "source" | "unreviewed" | "reviewed" | "machine" | "fallback";

interface LocaleContextValue {
  /** Aktuelle Oberflächensprache (ISO-Basiscode, z. B. "de", "vi", "fa"). */
  locale: string;
  /** Sprache wechseln — wirkt sofort (ohne Neuladen) und wird am Nutzer gespeichert, wenn angemeldet. */
  setLocale: (l: string) => void;
  t: (key: TKey, vars?: Vars) => string;
  dir: "ltr" | "rtl";
  /** Locale für Intl (immer lateinische Ziffern). */
  intl: string;
  quality: LanguageQuality;
  loading: boolean;
  signedIn: boolean;
  /** Vorschlag aus der Browser-Sprache beim ersten Login (null = kein Vorschlag). */
  suggestion: string | null;
  dismissSuggestion: () => void;
  fmt: {
    time: (d: Date | string | number, opts?: { seconds?: boolean }) => string;
    date: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
    dateTime: (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
    number: (n: number, opts?: Intl.NumberFormatOptions) => string;
  };
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStored(): string | null {
  try {
    return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
function writeStored(l: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // privates Fenster — dann gilt nur die Server-Einstellung
  }
}

/** Lädt die Texte einer Sprache: Prioritätsdatei (eigener Chunk) oder Laufzeit-Übersetzung vom Server. */
export async function loadLanguage(lang: string): Promise<{ dict: FlatDict | null; quality: LanguageQuality; meta?: LocaleMeta }> {
  const tier = languageTier(lang);
  if (tier === "builtin") return { dict: null, quality: "source" };
  if (isPriorityLanguage(lang)) {
    const file = await loadPriorityLanguage(lang);
    return { dict: file.strings, quality: file._meta.reviewed ? "reviewed" : "unreviewed", meta: file._meta };
  }
  try {
    const res = await fetch(`/api/i18n/${lang}`, { credentials: "same-origin" });
    if (!res.ok) return { dict: null, quality: "fallback" };
    const data = (await res.json()) as { strings: FlatDict };
    return { dict: data.strings, quality: Object.keys(data.strings).length ? "machine" : "fallback" };
  } catch {
    return { dict: null, quality: "fallback" };
  }
}

/**
 * Sprache der Mitarbeiter-Oberfläche (Prompt K1). Reihenfolge der Quellen:
 * User.language (Server, gilt auf jedem Gerät) → zuletzt auf diesem Gerät gewählt → Hotel-Standardsprache.
 * Hat ein Nutzer noch nie gewählt, wird die Browser-Sprache vorgeschlagen (nicht automatisch gesetzt).
 * Auf dem Gäste-Screen (/g/…) tut der Provider nichts — der hat seine eigene Sprache.
 */
export function LocaleProvider({ children, initialLocale = "de", initialDict = null }: { children: ReactNode; initialLocale?: string; initialDict?: FlatDict | null }) {
  const [locale, setLocaleState] = useState<string>(initialLocale);
  const [dict, setDict] = useState<FlatDict | null>(initialDict);
  const [quality, setQuality] = useState<LanguageQuality>(languageTier(initialLocale) === "builtin" ? "source" : "unreviewed");
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const requestId = useRef(0);

  const apply = useCallback(async (raw: string) => {
    const lang = normalizeLanguage(raw) ?? "de";
    const id = ++requestId.current;
    setLoading(true);
    const loaded = await loadLanguage(lang).catch(() => ({ dict: null, quality: "fallback" as const }));
    if (id !== requestId.current) return; // ein späterer Wechsel hat gewonnen
    setDict(loaded.dict);
    setQuality(loaded.quality);
    setLocaleState(lang);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (window.location.pathname.startsWith("/g/")) return;
    const stored = readStored();
    if (stored && stored !== locale) void apply(stored);
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" }).catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        const data = (await res.json()) as { user: { id: string; language: string | null } | null; hotelDefaultLanguage: string };
        setSignedIn(true);
        const own = normalizeLanguage(data.user?.language);
        const target = own ?? stored ?? normalizeLanguage(data.hotelDefaultLanguage) ?? "de";
        if (target !== (stored ?? locale)) void apply(target);
        if (own) writeStored(own);
        if (!own && data.user) {
          const browser = browserLanguage(navigator.languages ?? [navigator.language]);
          let done = false;
          try {
            done = window.localStorage.getItem(`${SUGGEST_KEY}.${data.user.id}`) === "1";
          } catch {}
          if (browser && !done) setSuggestion(browser);
        }
      } else if (!stored) {
        const d = await fetch("/api/i18n/default").then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const lang = normalizeLanguage(d?.language);
        if (!cancelled && lang && lang !== locale) void apply(lang);
      }
    })();
    return () => {
      cancelled = true;
    };
    // nur beim ersten Laden; danach steuert setLocale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (window.location.pathname.startsWith("/g/")) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
  }, [locale]);

  const markSuggestionDone = useCallback(() => {
    setSuggestion(null);
    void fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        try {
          if (d?.user?.id) window.localStorage.setItem(`${SUGGEST_KEY}.${d.user.id}`, "1");
        } catch {}
      })
      .catch(() => {});
  }, []);

  const setLocale = useCallback(
    (raw: string) => {
      const lang = normalizeLanguage(raw);
      if (!lang) return;
      writeStored(lang);
      void apply(lang);
      if (signedIn) {
        void fetch("/api/auth/me", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: lang }),
        }).catch(() => {});
      }
      if (suggestion) markSuggestionDone();
    },
    [apply, signedIn, suggestion, markSuggestionDone],
  );

  const dismissSuggestion = useCallback(() => {
    // „Nein, danke“ = aktuelle Sprache bewusst behalten → am Nutzer speichern, damit nicht erneut gefragt wird
    setLocale(locale);
  }, [locale, setLocale]);

  setActiveLanguage(locale); // für Format-Helfer außerhalb von Komponenten (hhmm, dateTime)
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translateKey(locale, key, vars, dict),
      dir: dirFor(locale),
      intl: intlLocale(locale),
      quality,
      loading,
      signedIn,
      suggestion,
      dismissSuggestion,
      fmt: {
        time: (d, o) => formatTime(locale, d, o),
        date: (d, o) => formatDate(locale, d, o),
        dateTime: (d, o) => formatDateTime(locale, d, o),
        number: (n, o) => formatNumber(locale, n, o),
      },
    }),
    [locale, setLocale, dict, quality, loading, signedIn, suggestion, dismissSuggestion],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale() must be used within a LocaleProvider");
  return ctx;
}
