import type { ImportType } from "@/lib/domain";

/** Betriebstag = Kalendertag der App-Uhr in Berlin (YYYY-MM-DD). Das Datum in einer Datei ist nur ein Abgleich. */
export const berlinToday = (now: Date = new Date()): string => now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Stand einer Liste gegenüber dem Betriebstag. */
export type FreshState = "fresh" | "stale" | "accepted";

export function freshState(businessDate: string | null | undefined, today: string, accepted = false): FreshState {
  if (businessDate === today) return "fresh";
  return accepted ? "accepted" : "stale";
}

/**
 * Plausibilität der Datumswerte gegen den Betriebstag: Anreisen heute oder später, Abreisen heute oder später.
 * Gibt die Anzahl unplausibler Zeilen zurück (Datumsformat vertauscht? veraltete Liste?).
 */
export function implausibleDateCount(
  type: ImportType, rows: { arrDate?: string; depDate?: string }[], today: string,
): number {
  if (type === "FORECAST" || type === "TRACES") return 0;
  return rows.filter((r) => {
    if (r.depDate && r.depDate < today) return true; // Abreise liegt in der Vergangenheit
    if (type === "ARRIVALS" && r.arrDate && r.arrDate < today) return true;
    return false;
  }).length;
}
