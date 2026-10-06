import type { AutoplanWeights } from "./weights";

/** Art der Arbeit im Zimmer heute (ARRIVAL-Zimmer werden nicht gereinigt und kommen hier nicht vor). */
export type WorkKind = "TURN" | "DEPARTURE" | "STAYOVER";
export type DemandingReason = "VIP" | "SUITE" | "ALLERGY" | "TRACES";
export type RoomState = "TODO" | "STARTED" | "DONE";
export type HkType = "VOLLZEIT" | "TEILZEIT" | "AZUBI";

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
}

export interface PlanInput {
  rooms: PlanRoom[];
  housekeepers: PlanHousekeeper[];
  weights: AutoplanWeights;
  maxFloors: number;
  /** Tagesziel Vollzeit (für "Benötigt: X Housekeeper"). */
  fullTimeTarget: number;
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
}

export interface PlanResult {
  assignment: Assignment;
  /** Je Housekeeper die Zimmer in Routen-Reihenfolge. */
  routes: { hkId: string; roomIds: string[] }[];
  metrics: HkMetrics[];
  reasons: Record<string, string[]>;
  warnings: PlanWarning[];
  unassigned: string[];
  needed: { housekeepers: number; targetCredits: number; present: number };
  cost: { total: number; parts: Record<string, number> };
  timedOut: boolean;
}
