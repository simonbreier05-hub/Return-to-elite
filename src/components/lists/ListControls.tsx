"use client";

import { useEffect, useState } from "react";
import Collapsible from "@/components/Collapsible";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { SortMode } from "@/lib/lists/rowLabels";
import { LABEL_STYLE } from "./RoomRowView";

/** Wert, den sich der Bildschirm für die Sitzung merkt (sessionStorage; ohne Speicher einfach Standard). */
export function useSessionState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try { const s = sessionStorage.getItem(key); if (s) setV(s as T); } catch { /* privat/blockiert: Standard */ }
  }, [key]);
  const set = (next: T) => { setV(next); try { sessionStorage.setItem(key, next); } catch { /* egal */ } };
  return [v, set];
}

const MODES: SortMode[] = ["suggested", "route", "kind"];
const MODE_KEY = { suggested: "lists.sortSuggested", route: "lists.sortRoute", kind: "lists.sortKind" } as const;

/** Sortierung (nur Anzeige) + einklappbare Legende der Zimmerkennzeichnung. */
export default function ListControls({ mode, onMode }: { mode: SortMode; onMode: (m: SortMode) => void }) {
  const { t } = useLocale();
  const legend: [keyof typeof LABEL_STYLE, Parameters<typeof t>[0]][] = [
    ["TURN", "lists.legendTurn"], ["DEPARTURE", "lists.legendDeparture"], ["STAYOVER", "lists.legendStayover"], ["ARRIVAL", "lists.legendArrival"],
  ];
  return (
    <div className="mt-3">
      <div role="group" aria-label={t("lists.sortLabel")} className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}
            className={`min-h-11 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${mode === m ? "border-navy bg-navy text-white" : "border-charcoal/15 bg-white hover:border-charcoal/30"}`}>
            {t(MODE_KEY[m])}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <Collapsible summary={<span className="text-sm font-medium">{t("lists.legend")}</span>}>
          <ul className="space-y-1.5 px-3 pb-3 text-sm">
            {legend.map(([k, key]) => (
              <li key={k} className="flex items-center gap-2"><span aria-hidden className={`h-4 w-1.5 shrink-0 rounded-full border-l-4 ${LABEL_STYLE[k].edge}`} />{t(key)}</li>
            ))}
            <li className="text-graphite/80">{t("lists.legendMarkers")}</li>
          </ul>
        </Collapsible>
      </div>
    </div>
  );
}
