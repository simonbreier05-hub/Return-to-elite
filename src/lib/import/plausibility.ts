import type { ArrivalRow, DepartureRow, ForecastDayRow, InHouseRow } from "./types";

/**
 * Plausibilitätsprüfung nach dem Import (rein, ohne DB, client-sicher): Zahlen der fünf Listen untereinander, mit dem
 * Tagesplan und mit der Forecast-Zeile des Tages vergleichen. Jede Abweichung ist ein Befund mit konkretem Unterschied
 * („In-House zeigt 90 belegt, Forecast erwartet 113“). Nie blockierend — der Supervisor bestätigt und plant weiter.
 * Nur Zahlen und Zimmernummern, keine Gastdaten.
 */
export type PlausibilityKey = "OCCUPIED" | "ARRIVALS" | "DEPARTURES" | "PERSONS" | "OCCUPANCY" | "UNKNOWN_ROOMS";

export interface PlausibilityFinding {
  key: PlausibilityKey;
  /** Verständlicher Satz mit beiden Zahlen. */
  message: string;
}

export interface PlausibilityInput {
  date: string;
  inventory: number;
  forecast: Pick<ForecastDayRow, "occupiedRooms" | "arrivals" | "departures" | "persons" | "occupancyPct" | "outOfOrder"> | null;
  inHouse: InHouseRow[] | null;
  arrivals: ArrivalRow[] | null;
  departures: DepartureRow[] | null;
  /** Tagesplan (nach dem Zusammenführen): heute Nacht belegt, Anreisen inkl. Turns, Abreisen inkl. Turns. */
  plan: { occupied: number; arrivals: number; departures: number } | null;
  /** Zimmer aus den Listen, die nicht im Zimmerstamm stehen (fehlen deshalb im Plan). */
  unknownRooms: string[];
}

/** Toleranz für die Auslastung in Prozentpunkten (Rundung im Opera-Ausdruck). */
export const OCCUPANCY_TOLERANCE_PP = 0.05;

export function checkPlausibility(i: PlausibilityInput): PlausibilityFinding[] {
  const out: PlausibilityFinding[] = [];
  const f = i.forecast;
  // In-House = heute Nacht belegt; Zeilen, die heute abreisen (manche Exporte führen sie mit), zählen nicht.
  const ih = i.inHouse?.filter((r) => r.depDate > i.date) ?? null;
  const ihResv = ih && ih.some((r) => r.status) ? ih.filter((r) => r.status === "RESV" || r.arrDate === i.date).length : null;
  const arrToday = i.arrivals?.filter((r) => r.arrDate === i.date).length ?? null;
  const depToday = i.departures?.filter((r) => r.depDate === i.date).length ?? null;

  /** Erste Quelle ist der Bezug; jede andere, die abweicht, wird mit ihm verglichen. */
  const compare = (key: PlausibilityKey, what: string, vals: [string, number | null][], expect: [string, number] | null) => {
    const have = vals.filter((v): v is [string, number] => v[1] !== null);
    if (expect) {
      for (const [src, n] of have) if (n !== expect[1]) out.push({ key, message: `${src} zeigt ${n} ${what}, ${expect[0]} erwartet ${expect[1]}.` });
    }
    // Listen untereinander (nur wenn kein Forecast-Bezug den Unterschied schon zeigt)
    if (!expect && have.length > 1) {
      const [ref, ...rest] = have;
      for (const [src, n] of rest) if (n !== ref[1]) out.push({ key, message: `${src} zeigt ${n} ${what}, ${ref[0]} zeigt ${ref[1]}.` });
    }
  };

  compare("OCCUPIED", "belegt", [["In-House", ih?.length ?? null], ["Tagesplan", i.plan?.occupied ?? null]], f ? ["Forecast", f.occupiedRooms] : null);
  compare("ARRIVALS", "Anreisen", [["Arrivals", arrToday], ["In-House (RESV)", ihResv], ["Tagesplan", i.plan?.arrivals ?? null]], f ? ["Forecast", f.arrivals] : null);
  compare("DEPARTURES", "Abreisen heute", [["Departures", depToday], ["Tagesplan", i.plan?.departures ?? null]], f ? ["Forecast", f.departures] : null);
  if (f && ih) {
    const persons = ih.reduce((a, r) => a + r.adults + r.children, 0);
    if (persons !== f.persons) out.push({ key: "PERSONS", message: `In-House zeigt ${persons} Personen, Forecast erwartet ${f.persons}.` });
    const pct = Math.round((ih.length / Math.max(1, i.inventory - f.outOfOrder)) * 10000) / 100;
    if (Math.abs(pct - f.occupancyPct) > OCCUPANCY_TOLERANCE_PP) {
      out.push({ key: "OCCUPANCY", message: `In-House ergibt ${fmtPct(pct)} Auslastung (${ih.length} von ${i.inventory} − ${f.outOfOrder} außer Betrieb), Forecast erwartet ${fmtPct(f.occupancyPct)}.` });
    }
  }
  if (i.unknownRooms.length) {
    const list = [...i.unknownRooms].sort();
    out.push({ key: "UNKNOWN_ROOMS", message: `${list.length} Zimmer aus den Listen fehlen im Zimmerstamm und daher im Plan: ${list.join(", ")}.` });
  }
  return out;
}

const fmtPct = (n: number) => `${n.toFixed(2).replace(".", ",")} %`;

/** Kurzer, stabiler Fingerabdruck der Befunde — eine Bestätigung gilt nur, solange sich die Befunde nicht ändern. */
export function plausibilitySignature(date: string, findings: PlausibilityFinding[]): string {
  const s = `${date}|${findings.map((x) => x.message).join("|")}`;
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) >>> 0;
  return `${date}:${h.toString(36)}`;
}
