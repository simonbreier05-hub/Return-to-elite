/**
 * Arbeitsdaten pro Housekeeper (H3, Schritt 6): reine Logik, client-sicher, keine Namen, keine Gastdaten.
 *
 * Messung: Dauer je Zimmer = „Gestartet" (IN_PROGRESS) → „Fertig" (CLEAN) durch dieselbe Person am selben Tag.
 * Nicht gezählt: Zimmer, die dazwischen blockiert waren (DND/BLOCKED) oder neu auf DIRTY/PICKUP gingen, Werte unter
 * `MIN_MINUTES` oder über `MAX_MINUTES`, und Zimmer über Nacht offen. Eine Pausen-Funktion (breakStartedAt) gibt es im
 * System noch nicht — sobald es sie gibt, hier herausrechnen.
 *
 * Tempo ist kein Leistungsranking: es gibt bewusst keine Funktion, die Personen vergleicht oder sortiert.
 */
export const MIN_MINUTES = 3;
export const MAX_MINUTES = 180;
export type Category = "TURN" | "DEPARTURE" | "STAYOVER" | "LAUNDRY" | "SUITE";
export const CATEGORIES: Category[] = ["TURN", "DEPARTURE", "STAYOVER", "LAUNDRY", "SUITE"];

export interface StatusEvt { userId: string | null; roomId: string; toStatus: string; at: number; day: string }
export interface Sample { hkId: string; roomId: string; day: string; minutes: number; start: number; end: number }

const INTERRUPT = new Set(["BLOCKED", "DIRTY", "PICKUP", "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE"]);

export function extractSamples(events: StatusEvt[]): Sample[] {
  const byRoom = new Map<string, StatusEvt[]>();
  for (const e of events) byRoom.set(e.roomId, [...(byRoom.get(e.roomId) ?? []), e]);
  const out: Sample[] = [];
  for (const list of byRoom.values()) {
    list.sort((a, b) => a.at - b.at);
    let open: { hk: string; at: number; day: string; broken: boolean } | null = null;
    for (const e of list) {
      if (e.toStatus === "IN_PROGRESS" && e.userId) { open = { hk: e.userId, at: e.at, day: e.day, broken: false }; continue; }
      if (!open) continue;
      if (INTERRUPT.has(e.toStatus)) { open.broken = true; continue; }
      if (e.toStatus === "CLEAN") {
        const minutes = (e.at - open.at) / 60_000;
        if (!open.broken && e.userId === open.hk && e.day === open.day && minutes >= MIN_MINUTES && minutes <= MAX_MINUTES) {
          out.push({ hkId: open.hk, roomId: e.roomId, day: e.day, minutes: Math.round(minutes * 10) / 10, start: open.at, end: e.at });
        }
        open = null;
      }
    }
  }
  return out;
}

export interface CatStat { n: number; mean: number; median: number; enough: boolean }
const r1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function catStats(values: number[], minSamples: number): CatStat {
  if (!values.length) return { n: 0, mean: 0, median: 0, enough: false };
  return { n: values.length, mean: r1(values.reduce((a, b) => a + b, 0) / values.length), median: r1(median(values)), enough: values.length >= minSamples };
}

export interface PersonStats {
  hkId: string;
  byCategory: Record<Category, CatStat>;
  /** Zimmer je Arbeitstag (Durchschnitt), Gesamtarbeitszeit je Tag (erster Start → letztes Fertig, Minuten). */
  roomsPerDay: number;
  workMinutesPerDay: number;
  days: number;
  samples: number;
  /** Tempo-Trend: Ø Minuten je Zimmer der letzten 7 Arbeitstage gegenüber den 7 davor (negativ = schneller). Null = zu wenig Daten. */
  trendPct: number | null;
}

/** Kennzahlen einer Person. `categoryOf` ordnet eine Messung (Zimmer + Tag) der Reinigungsart zu. */
export function personStats(hkId: string, samples: Sample[], categoryOf: (s: Sample) => Category[], minSamples: number): PersonStats {
  const mine = samples.filter((s) => s.hkId === hkId);
  const vals = Object.fromEntries(CATEGORIES.map((c) => [c, [] as number[]])) as Record<Category, number[]>;
  for (const s of mine) for (const c of categoryOf(s)) vals[c].push(s.minutes);
  const byDay = new Map<string, Sample[]>();
  for (const s of mine) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  const days = [...byDay.keys()].sort();
  const work = days.map((d) => { const l = byDay.get(d)!; return (Math.max(...l.map((x) => x.end)) - Math.min(...l.map((x) => x.start))) / 60_000; });
  const perRoom = (ds: string[]) => { const l = ds.flatMap((d) => byDay.get(d)!); return l.length ? l.reduce((a, b) => a + b.minutes, 0) / l.length : 0; };
  const recent = days.slice(-7), before = days.slice(-14, -7);
  const trendPct = recent.length >= 3 && before.length >= 3 ? Math.round(((perRoom(recent) - perRoom(before)) / perRoom(before)) * 100) : null;
  return {
    hkId,
    byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, catStats(vals[c], minSamples)])) as Record<Category, CatStat>,
    roomsPerDay: days.length ? r1(mine.length / days.length) : 0,
    workMinutesPerDay: work.length ? Math.round(work.reduce((a, b) => a + b, 0) / work.length) : 0,
    days: days.length, samples: mine.length, trendPct,
  };
}

/** Anonymer Hausdurchschnitt je Reinigungsart (Median über alle Messungen, ohne Personenbezug). */
export function houseMedians(samples: Sample[], categoryOf: (s: Sample) => Category[], minSamples: number): Partial<Record<Category, number>> {
  const vals: Partial<Record<Category, number[]>> = {};
  for (const s of samples) for (const c of categoryOf(s)) (vals[c] ??= []).push(s.minutes);
  const out: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) { const v = vals[c] ?? []; if (v.length >= minSamples) out[c] = r1(median(v)); }
  return out;
}

/**
 * Minuten je Reinigungsart für die Planung: eigener Median (genug Messwerte) → Hausdurchschnitt → Standard aus Credits.
 * Credits bleiben die Basisregel; diese Werte verfeinern nur die geschätzte Dauer.
 */
export function planningMinutes(p: PersonStats | undefined, house: Partial<Record<Category, number>>, defaults: Record<Category, number>): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => {
    const own = p?.byCategory[c];
    return [c, own?.enough ? own.median : house[c] ?? defaults[c]];
  })) as Record<Category, number>;
}

/** Standard je Reinigungsart aus dem Credit-Modell: Minuten je Credit × Faktor (Bleiber 0,5, mit Wäsche voll). */
export function defaultMinutes(minutesPerCredit: number, stayoverFactor: number, stayoverLaundryFactor: number): Record<Category, number> {
  return { TURN: minutesPerCredit, DEPARTURE: minutesPerCredit, STAYOVER: minutesPerCredit * stayoverFactor, LAUNDRY: minutesPerCredit * stayoverLaundryFactor, SUITE: minutesPerCredit * 1.5 };
}

/** „h:mm" für die Anzeige. */
export const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;
