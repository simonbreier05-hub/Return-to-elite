/**
 * Etagenzuweisung für das ganze Team (H1): reine Logik, keine DB, kein React — client-sicher.
 *
 * Regeln (Konstanten als Setting, Standard in DEFAULT_SETTINGS):
 *  - Vorschlag aus *tatsächlichen* Einsätzen (nie aus früheren Plänen): letzte `window` (5) Einsatztage der Person,
 *    eine Etage wird vorgeschlagen, wenn sie an ≥ `minDays` (3) dieser Tage dort gearbeitet hat; höchstens 2 Etagen.
 *    Tage ohne Einsatz (frei, Urlaub, krank) zählen nicht — sie tauchen in der Historie gar nicht auf.
 *  - Konflikt (zu viele Kandidaten für eine Etage): die stärkste Historie gewinnt (mehr Tage, dann jüngerer Einsatz),
 *    die anderen bekommen für diese Etage keinen Vorschlag. Supervisor: einer je Etage. Housekeeper: so viele, bis
 *    das Zimmer-Ziel der Etage gedeckt ist. Hausmann: keine Grenze.
 *  - Manuelle Zuteilung hat immer Vorrang: wer schon zugeteilt ist, bekommt keinen Vorschlag; seine Plätze zählen mit.
 *  - Max. 2 Etagen je Housekeeper ist weich (Warnung, kein Blockieren).
 */

export type TeamRole = "SUP" | "HK" | "HM";
export const FLOOR_MAX_SOFT = 2;

/** Ein tatsächlicher Einsatztag einer Person: Etagen, auf denen sie mindestens ein Zimmer abgeschlossen hat. */
export interface WorkDay { date: string; floors: number[] }

export interface FloorReason { floor: number; days: number; of: number; lastSeen: string; /** H3: aus Planungsänderungen gelernt statt aus Einsätzen. */ learned?: boolean }

export interface SuggestRules { window: number; minDays: number; maxFloors?: number }

/** Etagen-Vorschlag für eine Person aus ihren Einsatztagen (neueste zuerst egal, wird sortiert). */
export function suggestFromHistory(days: WorkDay[], rules: SuggestRules): FloorReason[] {
  const worked = [...days].filter((d) => d.floors.length > 0).sort((a, b) => b.date.localeCompare(a.date));
  const unique: WorkDay[] = [];
  for (const d of worked) if (!unique.some((u) => u.date === d.date)) unique.push(d);
  const last = unique.slice(0, Math.max(1, rules.window));
  if (!last.length) return [];
  const count = new Map<number, { days: number; lastSeen: string }>();
  for (const d of last) {
    for (const f of new Set(d.floors)) {
      const c = count.get(f) ?? { days: 0, lastSeen: d.date };
      c.days++;
      if (d.date > c.lastSeen) c.lastSeen = d.date;
      count.set(f, c);
    }
  }
  return [...count.entries()]
    .filter(([, c]) => c.days >= rules.minDays)
    .map(([floor, c]) => ({ floor, days: c.days, of: last.length, lastSeen: c.lastSeen }))
    .sort((a, b) => b.days - a.days || b.lastSeen.localeCompare(a.lastSeen) || a.floor - b.floor)
    .slice(0, rules.maxFloors ?? FLOOR_MAX_SOFT);
}

export interface Person {
  id: string;
  role: TeamRole;
  /** Housekeeper: Zielband in Zimmern (aus Typ + Stufe). Sonst 0. */
  roomsLo: number;
  roomsHi: number;
  /** Housekeeper: Stufe 1..3 (Stufe 1 → Warnung auf anspruchsvollen Etagen). Sonst 0. */
  level: number;
}

export interface FloorLoad {
  floor: number;
  /** Zu reinigende Zimmer laut Vorschlags-Eingabe (Abreise, Turn, Bleiber, Liegengebliebenes). */
  rooms: number;
  credits: number;
  departures: number;
  stayovers: number;
  /** Zimmer mit VIP/Suite/Allergiker/vielen Traces. */
  demanding: number;
}

/** Zuteilung: Person → Etagen (aufsteigend). */
export type FloorAssign = Record<string, number[]>;

export interface Suggestion { userId: string; floor: number; reason: FloorReason }

const mid = (p: Person) => (p.roomsLo + p.roomsHi) / 2;

/**
 * Vorschläge für alle Personen ohne manuelle Zuteilung, mit Konfliktauflösung je Etage.
 * `history` = Person → Einsatztage. Ergebnis ist deterministisch.
 */
export function resolveSuggestions(
  people: Person[], history: Record<string, WorkDay[]>, loads: FloorLoad[], manual: FloorAssign, rules: SuggestRules,
  /** H3: gelernte Etagen je Person (haben Vorrang vor der Einsatz-Historie, max. 2 Etagen bleibt). */
  learned: Record<string, FloorReason[]> = {},
): Suggestion[] {
  const loadBy = new Map(loads.map((l) => [l.floor, l]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const supTaken = new Set<number>();
  const hkCovered = new Map<number, number>(); // Etage → schon gedeckte Zimmer (Zielmitte je Person, geteilt durch ihre Etagen)
  for (const [id, floors] of Object.entries(manual)) {
    const p = byId.get(id);
    if (!p || !floors.length) continue;
    for (const f of floors) {
      if (p.role === "SUP") supTaken.add(f);
      if (p.role === "HK") hkCovered.set(f, (hkCovered.get(f) ?? 0) + mid(p) / floors.length);
    }
  }
  const cands: (Suggestion & { split: number })[] = [];
  for (const p of people) {
    if ((manual[p.id] ?? []).length) continue; // manuell zugeteilt → kein Vorschlag
    const fromLearned = (learned[p.id] ?? []).map((x) => ({ ...x, learned: true }));
    const fromHistory = suggestFromHistory(history[p.id] ?? [], rules).filter((x) => !fromLearned.some((l) => l.floor === x.floor));
    const reasons = [...fromLearned, ...fromHistory].slice(0, rules.maxFloors ?? FLOOR_MAX_SOFT);
    for (const r of reasons) cands.push({ userId: p.id, floor: r.floor, reason: r, split: reasons.length });
  }
  cands.sort((a, b) => b.reason.days - a.reason.days || b.reason.lastSeen.localeCompare(a.reason.lastSeen) || a.floor - b.floor || a.userId.localeCompare(b.userId));
  const out: Suggestion[] = [];
  for (const c of cands) {
    const p = byId.get(c.userId)!;
    if (!loadBy.has(c.floor) && p.role !== "SUP") continue; // Etage gibt es heute nicht im Plan
    if (p.role === "SUP") {
      if (supTaken.has(c.floor)) continue;
      supTaken.add(c.floor);
    } else if (p.role === "HK") {
      const need = loadBy.get(c.floor)?.rooms ?? 0;
      const have = hkCovered.get(c.floor) ?? 0;
      if (need <= 0 || have >= need) continue; // Etage schon gedeckt → schwächere Historie ohne Vorschlag
      hkCovered.set(c.floor, have + mid(p) / c.split);
    }
    out.push({ userId: c.userId, floor: c.floor, reason: c.reason });
  }
  return out;
}

/**
 * Vorschläge in eine Zuteilung übernehmen ("Alle Vorschläge übernehmen" oder ein einzelner per `only`).
 * Personen in `touched` (heute von Hand geändert) bekommen nichts — manuelle Zuteilung hat Vorrang.
 */
export function applySuggestions(assign: FloorAssign, suggestions: Suggestion[], touched: ReadonlySet<string> = new Set(), only?: { userId: string; floor: number }): FloorAssign {
  const out: FloorAssign = Object.fromEntries(Object.entries(assign).map(([k, v]) => [k, [...v]]));
  for (const s of suggestions) {
    if (only && (s.userId !== only.userId || s.floor !== only.floor)) continue;
    if (!only && touched.has(s.userId)) continue;
    const cur = out[s.userId] ?? [];
    if (!cur.includes(s.floor)) out[s.userId] = [...cur, s.floor].sort((a, b) => a - b);
  }
  return out;
}

export type Tone = "ok" | "low" | "high" | "none";

export interface FloorKpi {
  floor: number;
  /** Zimmer je Housekeeper (anteilig: wer auf 2 Etagen ist, zählt je Etage ½). */
  roomsPerHk: number | null;
  creditsPerHk: number | null;
  /** Zielband der eingeteilten Housekeeper, je Kopf gemittelt. */
  targetLo: number;
  targetHi: number;
  /** ok = im Band; high = zu viel Arbeit (Unterbesetzung); low = zu wenig Arbeit (Überbesetzung); none = kein Housekeeper. */
  tone: Tone;
  heads: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Live-Kennzahl je Etage. Toleranz: ein Zimmer über/unter dem Band gilt noch als ok. */
export function floorKpi(load: FloorLoad, people: Person[], assign: FloorAssign, tolerance = 1): FloorKpi {
  const hks = people.filter((p) => p.role === "HK" && (assign[p.id] ?? []).includes(load.floor));
  const heads = hks.reduce((a, p) => a + 1 / (assign[p.id]?.length || 1), 0);
  if (heads === 0) return { floor: load.floor, roomsPerHk: null, creditsPerHk: null, targetLo: 0, targetHi: 0, tone: load.rooms > 0 ? "none" : "ok", heads: 0 };
  const w = (p: Person) => 1 / (assign[p.id]?.length || 1);
  const lo = hks.reduce((a, p) => a + p.roomsLo * w(p), 0) / heads;
  const hi = hks.reduce((a, p) => a + p.roomsHi * w(p), 0) / heads;
  const per = load.rooms / heads;
  const tone: Tone = per > hi + tolerance ? "high" : per < lo - tolerance ? "low" : "ok";
  return { floor: load.floor, roomsPerHk: r1(per), creditsPerHk: r1(load.credits / heads), targetLo: r1(lo), targetHi: r1(hi), tone, heads: r1(heads) };
}

export type FloorWarningCode = "HK_TOO_MANY_FLOORS" | "LEVEL1_DEMANDING" | "FLOOR_NO_HK" | "FLOOR_NO_SUP" | "FLOOR_OVERLOAD" | "FLOOR_UNDERLOAD";
export interface FloorWarning { code: FloorWarningCode; floor?: number; userId?: string }

/** Weiche Warnungen — blockieren nie (außer „Etage ohne Supervisor" beim Speichern, siehe saveFloorTeam). */
export function floorWarnings(loads: FloorLoad[], people: Person[], assign: FloorAssign, demandingShare: number): FloorWarning[] {
  const out: FloorWarning[] = [];
  for (const p of people) {
    if (p.role === "HK" && (assign[p.id]?.length ?? 0) > FLOOR_MAX_SOFT) out.push({ code: "HK_TOO_MANY_FLOORS", userId: p.id });
  }
  for (const l of loads) {
    const on = people.filter((p) => (assign[p.id] ?? []).includes(l.floor));
    if (!on.some((p) => p.role === "SUP")) out.push({ code: "FLOOR_NO_SUP", floor: l.floor });
    if (l.rooms > 0 && !on.some((p) => p.role === "HK")) out.push({ code: "FLOOR_NO_HK", floor: l.floor });
    const share = l.rooms ? l.demanding / l.rooms : 0;
    if (l.demanding > 0 && share >= demandingShare) {
      for (const p of on) if (p.role === "HK" && p.level === 1) out.push({ code: "LEVEL1_DEMANDING", floor: l.floor, userId: p.id });
    }
    const k = floorKpi(l, people, assign);
    if (k.tone === "high") out.push({ code: "FLOOR_OVERLOAD", floor: l.floor });
    if (k.tone === "low") out.push({ code: "FLOOR_UNDERLOAD", floor: l.floor });
  }
  return out;
}

/** Zimmer-Zielband je Typ + Stufe (Antwort Simon 01.11.2026; Werte aus den Einstellungen). */
export function roomBand(type: string, level: number, s: Record<string, number>): { lo: number; hi: number } {
  const lv = Math.min(3, Math.max(1, Math.round(level)));
  const key = type === "TEILZEIT" ? `roomsTz${lv}` : type === "AZUBI" ? "roomsVz1" : `roomsVz${lv}`;
  const lo = s[`${key}Min`] ?? 0, hi = s[`${key}Max`] ?? lo;
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}

/** Zuteilung gegen den vorherigen Stand: je Person vorher/nachher (für das AuditLog, ohne Namen). */
export function floorDiff(before: FloorAssign, after: FloorAssign): { userId: string; before: number[]; after: number[] }[] {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const key = (a: number[] | undefined) => [...(a ?? [])].sort((x, y) => x - y).join(",");
  return ids.filter((id) => key(before[id]) !== key(after[id])).map((id) => ({
    userId: id, before: [...(before[id] ?? [])].sort((a, b) => a - b), after: [...(after[id] ?? [])].sort((a, b) => a - b),
  }));
}
