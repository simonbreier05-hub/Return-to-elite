/**
 * Lernen aus Planungsänderungen (H3, Schritt 5): einfache, nachvollziehbare Statistik — Häufigkeiten und Schwellen,
 * kein Blackbox-Modell, kein externer Dienst. Reine Logik, client-sicher.
 *
 * Regel (Konstanten als Setting, Standard in DEFAULT_SETTINGS):
 *  - Dieselbe Korrektur an ≥ `learnMinDays` (3) der letzten `learnWindow` (5) Planungstage → gelerntes Muster.
 *  - Muster, die `learnExpireDays` (10) Planungstage lang nicht mehr beobachtet wurden, laufen aus.
 *  - Abweichungen mit weight 0 (außergewöhnliche Lage) zählen nicht.
 *  - Gelöschte Muster lernen nur aus Beobachtungen nach dem Löschen neu.
 */
export type DeviationKind = "FLOOR_CHANGED" | "ROOM_MOVED" | "ROOM_DEFERRED";

export interface DeviationLike {
  date: string;
  kind: string;
  personId?: string | null;
  floor?: number | null;
  roomNumber?: string | null;
  before?: string | null;
  after?: string | null;
  weight: number;
}

export type PatternKind = "FLOOR" | "ROOM_PERSON" | "ROOM_LEVEL" | "ROOM_DEFERRED";

export interface Pattern {
  key: string;
  kind: PatternKind;
  personId?: string;
  floor?: number;
  roomNumber?: string;
  /** ROOM_PERSON: Ziel-Person; ROOM_LEVEL: Mindeststufe. */
  target?: string;
  minLevel?: number;
  /** An so vielen der betrachteten Planungstage beobachtet. */
  days: number;
  of: number;
  lastDate: string;
}

export interface LearnRules { window: number; minDays: number; expireDays: number }

/**
 * Schlüssel je Abweichung (gleiche Person + gleiche Ziel-Etage, gleiches Zimmer + gleiche Ziel-Person usw.).
 * ROOM_MOVED liefert zwei Schlüssel: Ziel-Person und — falls die Stufe stieg — Mindeststufe.
 */
export function keysOf(d: DeviationLike, levelOf?: (personId: string) => number | undefined): Omit<Pattern, "days" | "of" | "lastDate">[] {
  if (d.kind === "FLOOR_CHANGED" && d.personId && d.after) {
    return d.after.split(",").map((x) => Number(x)).filter((f) => Number.isFinite(f) && f > 0 && String(f) !== d.before)
      .map((f) => ({ key: `FLOOR|${d.personId}|${f}`, kind: "FLOOR" as const, personId: d.personId!, floor: f }));
  }
  if (d.kind === "ROOM_DEFERRED" && d.roomNumber) return [{ key: `DEFER|${d.roomNumber}`, kind: "ROOM_DEFERRED", roomNumber: d.roomNumber }];
  if (d.kind === "ROOM_MOVED" && d.roomNumber && d.after) {
    const out: Omit<Pattern, "days" | "of" | "lastDate">[] = [{ key: `ROOMP|${d.roomNumber}|${d.after}`, kind: "ROOM_PERSON", roomNumber: d.roomNumber, target: d.after }];
    const from = d.before && levelOf ? levelOf(d.before) : undefined, to = levelOf ? levelOf(d.after) : undefined;
    if (from !== undefined && to !== undefined && to > from) out.push({ key: `ROOML|${d.roomNumber}|${to}`, kind: "ROOM_LEVEL", roomNumber: d.roomNumber, minLevel: to });
    return out;
  }
  return [];
}

/**
 * Gelernte Muster aus den Abweichungen. `planningDays` = alle Tage, an denen geplant wurde (aufsteigend oder beliebig),
 * `deletedAt` = Muster-Schlüssel → Löschdatum (YYYY-MM-DD).
 */
export function learnPatterns(
  deviations: DeviationLike[], planningDays: string[], rules: LearnRules,
  opts: { levelOf?: (personId: string) => number | undefined; deletedAt?: Record<string, string> } = {},
): Pattern[] {
  const days = [...new Set(planningDays)].sort().reverse();
  const window = new Set(days.slice(0, rules.window));
  const alive = new Set(days.slice(0, rules.expireDays));
  const acc = new Map<string, { p: Omit<Pattern, "days" | "of" | "lastDate">; dates: Set<string> }>();
  for (const d of deviations) {
    if (!(d.weight > 0)) continue; // außergewöhnliche Lage zählt nicht
    for (const k of keysOf(d, opts.levelOf)) {
      const del = opts.deletedAt?.[k.key];
      if (del && d.date <= del) continue;
      const a = acc.get(k.key) ?? { p: k, dates: new Set<string>() };
      a.dates.add(d.date);
      acc.set(k.key, a);
    }
  }
  const out: Pattern[] = [];
  for (const { p, dates } of acc.values()) {
    const inWindow = [...dates].filter((x) => window.has(x)).length;
    const last = [...dates].sort().reverse()[0];
    if (!alive.has(last)) continue; // ausgelaufen
    if (inWindow < rules.minDays) continue;
    out.push({ ...p, days: inWindow, of: window.size, lastDate: last });
  }
  return out.sort((a, b) => b.days - a.days || b.lastDate.localeCompare(a.lastDate) || a.key.localeCompare(b.key));
}

/** Außergewöhnliche Lage: heute deutlich weniger Personal als üblich (Median der letzten Tage) → Gewicht 0. */
export function deviationWeight(teamToday: number, recentTeams: number[], dropShare = 0.3): number {
  if (!recentTeams.length) return 1;
  const s = [...recentTeams].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return median > 0 && teamToday < median * (1 - dropShare) ? 0 : 1;
}
