/**
 * Planung L1 (Meeting 13.11.2026, Regeln 7, 9, 10): Reihenfolge der Zimmer in der Housekeeper-Liste — rein, ohne DB/React,
 * damit Liste (`getHousekeeperList`), Housekeeper-Hub (`orderRoute` in `src/lib/rooms/hkGroups.ts`) und Tests dieselbe
 * Regel lesen.
 *
 *   0. Rush/Sofort         — nur Front Office/Supervisor setzen es (`Arrival.neededNow`), springt ganz nach oben
 *   1. Service Now         — Gastwunsch „jetzt“ (GuestRequest CLEAN_REQUEST, timing NOW/IN_30, offen)
 *   2. Turn                — nur wenn der abreisende Gast schon ausgecheckt ist (Anreise in ein leeres Zimmer zählt dazu)
 *   3. Bleiber             — mit oder ohne Wäschewechsel
 *   4. Turn, noch belegt   — Gast noch nicht ausgecheckt: wartet hinter den Bleibern
 *   5. Abreise/Deep clean
 *   6. „Reinigung ab HH:MM“ — Gastwunsch für später: nach hinten, Uhrzeit sichtbar; ab der Uhrzeit wieder normal
 *
 * VIP ist keine eigene Stufe (Entscheidung 14.11.). Innerhalb einer Stufe bleibt die gespeicherte Route (`routeOrder`).
 */

export type ListKind = "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL";

export const LIST_TIER = {
  RUSH: 0,
  SERVICE_NOW: 1,
  TURN: 2,
  STAYOVER: 3,
  TURN_WAITING: 4,
  DEPARTURE: 5,
  LATER: 6,
} as const;
export type ListTierName = keyof typeof LIST_TIER;

export interface ListOrderInput {
  kind: ListKind | null;
  /** Rush/Sofort (Front Office oder Supervisor). */
  rush: boolean;
  /** Offener Gastwunsch „Reinigung jetzt“. */
  serviceNow: boolean;
  /** Gastwunsch „Reinigung ab HH:MM“ (offen), sonst null. */
  cleanAfter: string | null;
  /** Abreisender Gast hat ausgecheckt (nur für Turns relevant). */
  checkedOut: boolean;
}

/** Stufe eines Zimmers zur Uhrzeit `nowHHMM` (Europe/Berlin, „HH:MM“). Kleinere Zahl = weiter oben. */
export function listTier(r: ListOrderInput, nowHHMM: string): number {
  if (r.rush) return LIST_TIER.RUSH;
  if (r.serviceNow) return LIST_TIER.SERVICE_NOW;
  if (r.cleanAfter && nowHHMM < r.cleanAfter) return LIST_TIER.LATER;
  switch (r.kind) {
    case "SAME_DAY_TURN": return r.checkedOut ? LIST_TIER.TURN : LIST_TIER.TURN_WAITING;
    case "ARRIVAL": return LIST_TIER.TURN; // Anreise in ein nicht gereinigtes, leeres Zimmer: niemand muss erst auschecken
    case "STAYOVER": return LIST_TIER.STAYOVER;
    case "DEPARTURE": return LIST_TIER.DEPARTURE;
    default: return LIST_TIER.STAYOVER;
  }
}

/** Opera-/Hauscodes, die „abgereist“ bedeuten (Stay.resStatus) — zusätzlich zu `Stay.status === "CHECKED_OUT"`. */
export const CHECKED_OUT_CODES = new Set(["CHECKED_OUT", "CHKD", "CKOT", "CO"]);

export function isCheckedOut(stay: { status?: string | null; resStatus?: string | null } | null | undefined): boolean {
  if (!stay) return false;
  return stay.status === "CHECKED_OUT" || (!!stay.resStatus && CHECKED_OUT_CODES.has(stay.resStatus.toUpperCase()));
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Gastwunsch zur Reinigungszeit aus `GuestRequest.detail` ({"timing":"NOW"|"IN_30"|"LATER","time":"13:00"}).
 * Unlesbar/ohne Zeit → kein Signal.
 */
export function parseCleanWish(detail: string | null | undefined): { serviceNow: boolean; cleanAfter: string | null } {
  if (!detail) return { serviceNow: false, cleanAfter: null };
  try {
    const d = JSON.parse(detail) as { timing?: string; time?: string };
    if (d.timing === "NOW" || d.timing === "IN_30") return { serviceNow: true, cleanAfter: null };
    if (d.timing === "LATER" && typeof d.time === "string" && HHMM.test(d.time)) return { serviceNow: false, cleanAfter: d.time };
  } catch {
    /* kein Signal */
  }
  return { serviceNow: false, cleanAfter: null };
}

/** Sortiert nach Stufe, innerhalb der Stufe nach gespeicherter Route, dann Zimmernummer. Stabil, verändert nichts. */
export function sortByListOrder<T extends { number: string; routeOrder?: number | null }>(rows: T[], tierOf: (r: T) => number): T[] {
  return rows
    .map((r, i) => ({ r, i, t: tierOf(r) }))
    .sort((a, b) =>
      a.t - b.t ||
      (a.r.routeOrder ?? Infinity) - (b.r.routeOrder ?? Infinity) ||
      a.r.number.localeCompare(b.r.number) || a.i - b.i)
    .map((x) => x.r);
}
