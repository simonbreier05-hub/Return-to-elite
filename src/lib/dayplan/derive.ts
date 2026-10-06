import { diffDays } from "@/lib/import/dates";
import type { ArrivalRow, DepartureRow, ParseIssue } from "@/lib/import/types";
import { isLaundryDue } from "@/lib/rooms/laundryDue";

/**
 * Tagesplan aus den Opera-Listen ableiten (reine Funktion, keine DB).
 *
 * | Art           | Regel                                                                    |
 * |---------------|--------------------------------------------------------------------------|
 * | DEPARTURE     | Abreise heute, kein anderer Gast reist heute in dasselbe Zimmer an       |
 * |               | (im Spec "CHECKOUT" — hier der vorhandene Name aus roomDayCategory)      |
 * | SAME_DAY_TURN | Abreise heute UND ein anderer Gast reist heute an                        |
 * | STAYOVER      | Anreise vor heute, Abreise nach heute — täglich reinigen                 |
 * | ARRIVAL       | Anreise heute, Zimmer vorher leer: keine Reinigung, nur Anzeige          |
 * | (keine Zeile) | sonst                                                                    |
 *
 * Aufenthalte sind über (Zimmer, Anreisedatum) identisch, nie über die
 * Reservierungsnummer (die wird nicht gespeichert).
 */
export type DayCleaningType = "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL";

export interface DerivedStay {
  room: string;
  arrDate: string;
  depDate: string;
  status: string | null;
  vip: boolean;
  arrTime: string | null;
  adults: number;
  children: number;
  /** Aus welcher Liste: Departures (Zeitraum) und/oder Arrivals. */
  inDepartures: boolean;
  inArrivals: boolean;
}

export interface DerivedRoom {
  room: string;
  cleaningType: DayCleaningType;
  laundryDue: boolean;
  nights: number | null;
  vip: boolean;
  eta: string | null;
  /** Der bleibende bzw. abreisende Aufenthalt (arrDate) — und der anreisende. */
  stay: string | null;
  arrivingStay: string | null;
}

export interface DayFiguresDerived {
  departures: number; // Abreisen (Same-Day-Turns einmal)
  arrivals: number;
  stayovers: number;
  eveningOccupancy: number; // Bleiber + Anreisen
  /** Tageszahl: zu reinigende Zimmer = Abreisen + Bleiber. */
  cleaningCount: number;
}

export interface DeriveInput {
  date: string; // YYYY-MM-DD
  departures: DepartureRow[];
  arrivals: ArrivalRow[];
  /** Letzte bestätigte Wäschewechsel je Zimmer (YYYY-MM-DD), falls bekannt. */
  lastLinenChange?: Record<string, string | null | undefined>;
  linenCycleDays: number;
}

const issue = (severity: ParseIssue["severity"], code: string, message: string, room?: string): ParseIssue => ({ severity, code, message, room });

/** Aufenthalte aus beiden Listen zusammenführen; Widersprüche melden, nicht raten. */
export function mergeStays(departures: DepartureRow[], arrivals: ArrivalRow[]): { stays: DerivedStay[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const map = new Map<string, DerivedStay>();
  for (const d of departures) {
    map.set(`${d.room}|${d.arrDate}`, {
      room: d.room, arrDate: d.arrDate, depDate: d.depDate, status: d.status, vip: d.vip, arrTime: null,
      adults: d.adults, children: d.children, inDepartures: true, inArrivals: false,
    });
  }
  for (const a of arrivals) {
    const key = `${a.room}|${a.arrDate}`;
    const have = map.get(key);
    if (!have) {
      map.set(key, {
        room: a.room, arrDate: a.arrDate, depDate: a.depDate, status: a.status, vip: a.vip, arrTime: a.arrTime,
        adults: a.adults, children: a.children, inDepartures: false, inArrivals: true,
      });
      continue;
    }
    if (have.depDate !== a.depDate) {
      issues.push(issue("WARNING", "STAY_DATE_CONFLICT",
        `Zimmer ${a.room}: Abreise laut Departures ${have.depDate}, laut Arrivals ${a.depDate}. Es gilt die Departures-Liste — bitte prüfen.`, a.room));
    }
    have.inArrivals = true;
    have.arrTime = a.arrTime ?? have.arrTime;
    have.vip = have.vip || a.vip;
  }
  return { stays: [...map.values()], issues };
}

export function deriveDayPlan(input: DeriveInput): {
  rooms: DerivedRoom[]; stays: DerivedStay[]; figures: DayFiguresDerived; issues: ParseIssue[];
} {
  const { date } = input;
  const { stays, issues } = mergeStays(input.departures, input.arrivals);
  const byRoom = new Map<string, DerivedStay[]>();
  for (const s of stays) byRoom.set(s.room, [...(byRoom.get(s.room) ?? []), s]);

  const rooms: DerivedRoom[] = [];
  for (const [room, list] of [...byRoom.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const departing = list.filter((s) => s.depDate === date && s.arrDate <= date);
    const staying = list.filter((s) => s.arrDate < date && s.depDate > date);
    const arriving = list.filter((s) => s.arrDate === date && s.depDate > date);
    if (departing.length > 1 || staying.length > 1 || arriving.length > 1 || (staying.length && (departing.length || arriving.length))) {
      issues.push(issue("WARNING", "ROOM_CONFLICT", `Zimmer ${room}: mehrere sich überschneidende Aufenthalte in den Listen — bitte prüfen.`, room));
    }
    const dep = departing[0], stay = staying[0], arr = arriving[0];
    if (dep && arr) {
      rooms.push({ room, cleaningType: "SAME_DAY_TURN", laundryDue: false, nights: null, vip: arr.vip || dep.vip, eta: arr.arrTime, stay: dep.arrDate, arrivingStay: arr.arrDate });
    } else if (dep) {
      rooms.push({ room, cleaningType: "DEPARTURE", laundryDue: false, nights: diffDays(dep.arrDate, date), vip: dep.vip, eta: null, stay: dep.arrDate, arrivingStay: null });
    } else if (stay) {
      const linen = input.lastLinenChange?.[room] ?? null;
      // Zähler ab Anreise: ein Wäschewechsel vor der Anreise gehört dem Vorgänger und zählt nicht.
      const ref = linen && linen > stay.arrDate ? linen : stay.arrDate;
      const due = isLaundryDue({
        category: "STAYOVER",
        lastLinenChangeAt: new Date(`${ref}T00:00:00Z`),
        now: new Date(`${date}T00:00:00Z`),
        linenCycleDays: input.linenCycleDays,
      });
      rooms.push({ room, cleaningType: "STAYOVER", laundryDue: due, nights: diffDays(stay.arrDate, date), vip: stay.vip, eta: null, stay: stay.arrDate, arrivingStay: null });
    } else if (arr) {
      rooms.push({ room, cleaningType: "ARRIVAL", laundryDue: false, nights: null, vip: arr.vip, eta: arr.arrTime, stay: null, arrivingStay: arr.arrDate });
    }
  }

  const count = (t: DayCleaningType) => rooms.filter((r) => r.cleaningType === t).length;
  const departures = count("DEPARTURE") + count("SAME_DAY_TURN");
  const stayovers = count("STAYOVER");
  const arrivals = count("ARRIVAL") + count("SAME_DAY_TURN");
  return {
    rooms, stays, issues,
    figures: { departures, arrivals, stayovers, eveningOccupancy: stayovers + arrivals, cleaningCount: departures + stayovers },
  };
}

/** Toleranz für den Vergleich mit dem Forecast: max(ABS, REL × Forecast-Wert). */
export const FORECAST_COMPARE_ABS = 3;
export const FORECAST_COMPARE_REL = 0.05;

export interface ForecastDayLite { date: string; occupiedRooms: number; arrivals: number; departures: number }

/** Abgeleitete Zahlen gegen den Forecast des Tages. Nur Warnung, nie blockierend. */
export function compareWithForecast(figures: DayFiguresDerived, f: ForecastDayLite | null | undefined): ParseIssue[] {
  if (!f) return [issue("INFO", "NO_FORECAST_DAY", "Für diesen Tag liegt kein Forecast vor — Plausibilitätsprüfung übersprungen.")];
  const pairs: [string, number, number][] = [
    ["Belegung heute Nacht", figures.eveningOccupancy, f.occupiedRooms],
    ["Anreisen", figures.arrivals, f.arrivals],
    ["Abreisen", figures.departures, f.departures],
  ];
  const off = pairs.filter(([, mine, theirs]) => Math.abs(mine - theirs) > Math.max(FORECAST_COMPARE_ABS, FORECAST_COMPARE_REL * theirs));
  if (!off.length) return [];
  return [issue("WARNING", "FORECAST_MISMATCH",
    `Listen und Forecast passen nicht zusammen, bitte prüfen: ${off.map(([n, mine, theirs]) => `${n} ${mine} (Listen) vs. ${theirs} (Forecast)`).join("; ")}.`)];
}
