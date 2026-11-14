/** Zimmertypen, die als "Suite" (anspruchsvoll) gelten — offene Frage 3 im Interview: alle Suiten oder nur höhere? */
export const SUITE_TYPES = ["JUNIOR_SUITE", "SUITE", "PENTHOUSE"] as const;

import type { AutoplanWeights } from "./weights";

/** Art der Arbeit im Zimmer heute (ARRIVAL-Zimmer werden nicht gereinigt und kommen hier nicht vor). */
export type WorkKind = "TURN" | "DEPARTURE" | "STAYOVER";
export type DemandingReason = "VIP" | "SUITE" | "ALLERGY" | "TRACES";
export type RoomState = "TODO" | "STARTED" | "DONE";
/** EXTERN = Springer/externe Aushilfe (Planung L1): ohne Präferenz-Etagen, geht dorthin, wo Bedarf ist; Band wie Vollzeit. */
export type HkType = "VOLLZEIT" | "TEILZEIT" | "AZUBI" | "EXTERN";
export const HK_TYPES = ["VOLLZEIT", "TEILZEIT", "AZUBI", "EXTERN"] as const;

/** Planung L1: Einschränkungen je Person (feste Codes, weich — Strafterm + Warnung, nie eine Sperre). */
export const HK_RESTRICTIONS = ["NO_SUITE", "NO_VIP", "NO_ALLERGY"] as const;
export type HkRestriction = (typeof HK_RESTRICTIONS)[number];

/** Liest `User.hkRestrictions` (komma-getrennt); unbekannte Codes fallen weg. */
export function parseRestrictions(csv: string | null | undefined): HkRestriction[] {
  const known = new Set<string>(HK_RESTRICTIONS);
  return [...new Set((csv ?? "").split(",").map((x) => x.trim()).filter((x) => known.has(x)))] as HkRestriction[];
}

export interface PlanRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  kind: WorkKind;
  /** Wäschewechsel heute fällig (nur Bleiber). */
  laundry: boolean;
  vip: boolean;
  /** Anreisezeit des neuen Gastes "HH:MM" (nur Turn). */
  eta: string | null;
  credits: number;
  demanding: DemandingReason[];
  traces: number;
  /** Ids der Zimmer, mit denen dieses verbunden ist (Interconnecting). */
  interconnect: string[];
  state: RoomState;
  /** Feste (manuelle/heutige) Zuteilung: der Vorschlag verschiebt das Zimmer nie. */
  fixedTo: string | null;
  /** H3 gelernt: Zimmer ging an den letzten Tagen immer an diese Person (weich, Gewicht `learned`). */
  preferHk?: string;
  /** H3 gelernt: Zimmer ging immer an mindestens diese Stufe (weich). */
  minLevel?: number;
  /** H3: Begründung für die Anzeige, z. B. „gelernt: an 4 von 5 Planungstagen so geändert". */
  learnedReason?: string;
  /** Planung L1 (Regel 13): Bleiber — diese Kraft hat beim selben Aufenthalt schon gereinigt (weich, Gewicht `stayContinuity`). */
  stayHk?: string;
}

export interface PlanHousekeeper {
  id: string;
  name: string;
  type: HkType;
  /** 1 = nie anspruchsvolle Zimmer. Beschäftigtendaten: nur Supervisor sehen das. */
  level: 1 | 2 | 3;
  homeFloors: number[];
  yesterdayFloors: number[];
  /** Zielband der Credits [lo, hi]. */
  lo: number;
  hi: number;
  /** Zielband in Zimmern (Hauptziel, je Typ — Plan-1b). Fehlt → nur Credits. */
  roomsLo?: number;
  roomsHi?: number;
  /** H1: heutige Etagen laut Etagenzuweisung (User.floorsOn === heute). Gesetzt → ersetzt Stammetage/gestern als Präferenz. */
  todayFloors?: number[];
  /** H3: gemessene bzw. geschätzte Minuten je Reinigungsart (nur wenn „Messdaten in Planung verwenden" an ist). */
  minutesByKind?: { TURN: number; DEPARTURE: number; STAYOVER: number; LAUNDRY: number; SUITE: number };
  /** Planung L1: Einschränkungen (z. B. keine Suiten) — weich. */
  restrictions?: HkRestriction[];
}

export interface PlanInput {
  rooms: PlanRoom[];
  housekeepers: PlanHousekeeper[];
  weights: AutoplanWeights;
  maxFloors: number;
  /** Tagesziel Vollzeit in Credits (Gegenprobe). */
  fullTimeTarget: number;
  /** Plan-1b: Zimmer je Vollzeitkraft (Mitte des Bands) — Grundlage für „Benötigt: X Housekeeper“. Fehlt → Credits. */
  fullTimeRooms?: number;
  /** H3: Schichtlänge in Minuten (Warnung/Gewicht „nicht vor Schichtende fertig"). */
  shiftMinutes?: number;
  /** Planung L1 (Regel 4): höchstens so viele Suiten je Kraft (weich, Warnung). Fehlt → keine Grenze. */
  maxSuites?: number;
  /** Planung L1: ab diesem Credit zählt ein Zimmer als Suite (Standard 1,5). Fehlt → Zimmertyp (`demanding` SUITE). */
  suiteMinCredit?: number;
}

/** Planung L1: Zählt das Zimmer als Suite? Nach Credit (Zimmerliste v2.1), ohne Schwelle nach Zimmertyp. */
export function isSuite(r: Pick<PlanRoom, "credits" | "demanding">, suiteMinCredit?: number): boolean {
  return suiteMinCredit ? r.credits >= suiteMinCredit : r.demanding.includes("SUITE");
}

/** Planung L1: verletzt dieses Zimmer eine Einschränkung der Kraft? (gibt den Code zurück) */
export function restrictionHit(h: Pick<PlanHousekeeper, "restrictions">, r: Pick<PlanRoom, "credits" | "demanding">, suiteMinCredit?: number): HkRestriction | null {
  for (const x of h.restrictions ?? []) {
    if (x === "NO_SUITE" && isSuite(r, suiteMinCredit)) return x;
    if (x === "NO_VIP" && r.demanding.includes("VIP")) return x;
    if (x === "NO_ALLERGY" && r.demanding.includes("ALLERGY")) return x;
  }
  return null;
}

/** roomId → housekeeperId (oder null = offen). */
export type Assignment = Record<string, string | null>;

export interface PlanWarning {
  code: string;
  severity: "WARNING" | "INFO";
  message: string;
  roomIds?: string[];
  hkId?: string;
}

export interface HkMetrics {
  hkId: string;
  rooms: number;
  credits: number;
  departures: number; // Abreisen inkl. Turns
  turns: number;
  stayovers: number; // Bleiber ohne Wäschewechsel
  linen: number; // Bleiber mit Wäschewechsel
  floors: number[];
  demanding: number;
  lo: number;
  hi: number;
  roomsLo?: number;
  roomsHi?: number;
  /** H3: geschätzte Arbeitszeit in Minuten (nur mit Messdaten). */
  expectedMinutes?: number;
}

export interface PlanResult {
  assignment: Assignment;
  /** Je Housekeeper die Zimmer in Routen-Reihenfolge. */
  routes: { hkId: string; roomIds: string[] }[];
  metrics: HkMetrics[];
  reasons: Record<string, string[]>;
  warnings: PlanWarning[];
  unassigned: string[];
  needed: { housekeepers: number; targetCredits: number; targetRooms?: number; present: number };
  cost: { total: number; parts: Record<string, number> };
  timedOut: boolean;
}
