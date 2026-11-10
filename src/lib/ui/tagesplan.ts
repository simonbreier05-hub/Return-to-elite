/**
 * Anzeige-Regeln des Tagesplans (Plan-1): Reinigungsart je Zimmer, Status je Kraft (✓/▲/⚠/▼), Etagen-Zeilen,
 * Hinweise-Liste, Plan-Status. Rein und client-sicher: keine DB, keine API, kein React.
 * Zählt nichts neu: Art/Wäsche kommen aus `computeDayNumbers`-Zeilen (`DayNumberRow`), Credits aus
 * `usePlanningFloorPlan` (`computeRoomCredit`), offene Zimmer aus `DayNumbers.openIds`. Hier wird nur gruppiert.
 */
import type { TKey } from "@/lib/i18n/translations";
import type { DayKind } from "@/lib/dayplan/dayNumbers";
import type { IconName } from "./icons";
import type { Tone } from "./tone";
import { DEFAULT_SETTINGS } from "@/lib/domain";
import { roomBand } from "@/lib/planung/floorTeam";
import { MAX_FLOORS_HINT, OVERLOAD_EXTRA_ROOMS, type CrewKind } from "./tagesplanConfig";

/** Einstellungen mit den Zimmer-Spannen (`/api/settings` → `settings`); fehlt etwas, gilt der Standard. */
export type BandSettings = Partial<Record<string, number>>;

// ── Reinigungsart ──────────────────────────────────────────────────────────

/** Arten im Tagesplan: Tidy (Bleiber), Linen change (Bleiber + Wäsche), Turn (Abreise + Anreise), Deep clean (Abreise ohne Anreise), Anreise. */
export const CLEAN_KINDS = ["turn", "linen", "tidy", "deep", "arrival"] as const;
export type CleanKind = (typeof CLEAN_KINDS)[number];

export const CLEAN_KIND_UI: Record<CleanKind, { icon: IconName; tone: Tone; labelKey: TKey; shortKey: TKey }> = {
  turn: { icon: "refresh", tone: "accent", labelKey: "tagesplan.kindTurn", shortKey: "tagesplan.kindTurnShort" },
  linen: { icon: "shirt", tone: "info", labelKey: "tagesplan.kindLinen", shortKey: "tagesplan.kindLinenShort" },
  tidy: { icon: "bed-single", tone: "success", labelKey: "tagesplan.kindTidy", shortKey: "tagesplan.kindTidyShort" },
  deep: { icon: "log-out", tone: "warning", labelKey: "tagesplan.kindDeep", shortKey: "tagesplan.kindDeepShort" },
  arrival: { icon: "log-in", tone: "neutral", labelKey: "tagesplan.kindArrival", shortKey: "tagesplan.kindArrivalShort" },
};

/** Art aus einer Tageszeile. `OCCUPIED` (belegt ohne Tagesplan) wird nicht gereinigt → null. */
export function cleanKindOf(row: { kind: DayKind; laundryDue: boolean }): CleanKind | null {
  switch (row.kind) {
    case "TURN": return "turn";
    case "DEPARTURE": return "deep";
    case "STAYOVER": return row.laundryDue ? "linen" : "tidy";
    case "ARRIVAL": return "arrival";
    default: return null;
  }
}

export type KindMix = Record<CleanKind, number>;
export const emptyMix = (): KindMix => ({ turn: 0, linen: 0, tidy: 0, deep: 0, arrival: 0 });

/** Zähler nur für Werte > 0, in fester Reihenfolge. */
export function mixEntries(mix: KindMix): { kind: CleanKind; count: number }[] {
  return CLEAN_KINDS.filter((k) => mix[k] > 0).map((k) => ({ kind: k, count: mix[k] }));
}

// ── Status je Kraft ────────────────────────────────────────────────────────

export const LOAD_STATES = ["balanced", "high", "overload", "low"] as const;
export type LoadState = (typeof LOAD_STATES)[number];

/** Status nie nur über Farbe: Symbol + Wort. ✓ Ausgewogen ▲ Hoch ⚠ Überlast ▼ Niedrig. */
export const LOAD_UI: Record<LoadState, { icon: IconName; tone: Tone; labelKey: TKey; sign: string }> = {
  balanced: { icon: "check", tone: "success", labelKey: "tagesplan.loadBalanced", sign: "✓" },
  high: { icon: "chevron-up", tone: "warning", labelKey: "tagesplan.loadHigh", sign: "▲" },
  overload: { icon: "triangle-alert", tone: "danger", labelKey: "tagesplan.loadOverload", sign: "⚠" },
  low: { icon: "chevron-down", tone: "info", labelKey: "tagesplan.loadLow", sign: "▼" },
};

const SEVERITY: Record<LoadState, number> = { overload: 3, high: 2, low: 1, balanced: 0 };

export function crewKindOf(kind: string | null | undefined): CrewKind {
  return kind === "TEILZEIT" || kind === "AZUBI" ? kind : "VOLLZEIT";
}

/** Zimmer-Spanne einer Kraft: dieselbe Regel wie der Zuteilungsvorschlag (`roomBand`, Hausregel aus den Einstellungen). */
export function bandOf(kind: string | null | undefined, settings?: BandSettings) {
  return roomBand(crewKindOf(kind), { ...(DEFAULT_SETTINGS as unknown as Record<string, number>), ...(settings as Record<string, number> | undefined) });
}

/** Zimmerzahl gegen die Spanne des Typs. */
export function loadState(rooms: number, band: { lo: number; hi: number }): LoadState {
  if (rooms > band.hi + OVERLOAD_EXTRA_ROOMS) return "overload";
  if (rooms > band.hi) return "high";
  if (rooms < band.lo) return "low";
  return "balanced";
}

/** Schlimmster Status einer Gruppe (Etagen-Zeile). Leere Gruppe = null. */
export function worstState(states: LoadState[]): LoadState | null {
  if (!states.length) return null;
  return states.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a));
}

export const roundCredits = (n: number) => Math.round(n * 10) / 10;

// ── Kräfte und Etagen ─────────────────────────────────────────────────────

/** Ein Zimmer des Tages, wie es der Tagesplan braucht (alles aus dem Bestand vorberechnet). */
export interface PlanRoom {
  id: string;
  number: string;
  /** null = Zimmer hat keine Etage im Grundriss. */
  floor: number | null;
  kind: CleanKind;
  credit: number;
  assignedToId: string | null;
  /** In `DayNumbers.openIds` (zu reinigen, noch nicht zugeteilt). */
  open: boolean;
}

/** `band` = Zimmer-Band der Kraft vom Server (berücksichtigt das persönliche Tagesziel); fehlt es, gilt das Band des Typs. */
export interface Crew { id: string; name: string; kind?: string | null; band?: { lo: number; hi: number } }

export interface CrewSummary {
  id: string;
  name: string;
  rooms: number;
  credits: number;
  band: { lo: number; hi: number };
  state: LoadState;
  mix: KindMix;
  floors: number[];
  /** Je Etage: Zimmer und Credits dieser Kraft (arbeitet sie auf 2 Etagen, steht sie in beiden Zeilen). */
  byFloor: Record<number, { rooms: number; credits: number }>;
  roomIds: string[];
}

export function crewSummaries(crew: Crew[], rooms: PlanRoom[], settings?: BandSettings): CrewSummary[] {
  return crew.map((c) => {
    const mine = rooms.filter((r) => r.assignedToId === c.id);
    const mix = emptyMix();
    const byFloor: CrewSummary["byFloor"] = {};
    let credits = 0;
    for (const r of mine) {
      mix[r.kind]++;
      credits += r.credit;
      if (r.floor != null) {
        const f = (byFloor[r.floor] ??= { rooms: 0, credits: 0 });
        f.rooms++; f.credits = roundCredits(f.credits + r.credit);
      }
    }
    const band = c.band ?? bandOf(c.kind, settings);
    return {
      id: c.id, name: c.name, rooms: mine.length, credits: roundCredits(credits), band,
      state: loadState(mine.length, band), mix,
      floors: Object.keys(byFloor).map(Number).sort((a, b) => a - b), byFloor,
      roomIds: mine.map((r) => r.id),
    };
  });
}

export interface FloorLaneData {
  /** null = „Ohne Etage“. */
  floor: number | null;
  mix: KindMix;
  total: number;
  open: number;
  crew: { id: string; name: string; rooms: number; credits: number; state: LoadState }[];
  /** Ø Credits je Kraft auf dieser Etage (nur Kräfte mit Zimmern hier). */
  avgCredits: number | null;
  state: LoadState | null;
}

export function floorLanes(floors: number[], rooms: PlanRoom[], crew: CrewSummary[]): FloorLaneData[] {
  const lane = (floor: number | null): FloorLaneData => {
    const here = rooms.filter((r) => r.floor === floor);
    const mix = emptyMix();
    for (const r of here) mix[r.kind]++;
    const people = floor == null ? [] : crew.filter((c) => c.byFloor[floor]).map((c) => ({ id: c.id, name: c.name, rooms: c.byFloor[floor].rooms, credits: c.byFloor[floor].credits, state: c.state }));
    const avg = people.length ? roundCredits(people.reduce((a, p) => a + p.credits, 0) / people.length) : null;
    return { floor, mix, total: here.length, open: here.filter((r) => r.open).length, crew: people, avgCredits: avg, state: worstState(people.map((p) => p.state)) };
  };
  return floors.map(lane);
}

/** Zimmer laut `roomInventory`, die keiner Etage im Grundriss zugeordnet sind (nie still weglassen). */
export function roomsWithoutFloor(inventory: number, roomsOnFloors: number): number {
  return Math.max(0, inventory - roomsOnFloors);
}

// ── Hinweise ──────────────────────────────────────────────────────────────

export const HINT_KINDS = ["overload", "floors", "level", "unassigned"] as const;
export type HintKind = (typeof HINT_KINDS)[number];

export interface PlanHint {
  kind: HintKind;
  /** Wohin der Sprung geht: Kraft (Kraft-Detail) und/oder Etage (Zeile öffnen). */
  crewId?: string;
  floor?: number;
  roomIds?: string[];
  /** Für den Text: Name, Anzahl, Etagenliste. Nie Gastdaten. */
  name?: string;
  count?: number;
  floors?: number[];
}

export const HINT_UI: Record<HintKind, { icon: IconName; tone: Tone; labelKey: TKey }> = {
  overload: { icon: "triangle-alert", tone: "danger", labelKey: "tagesplan.hintOverload" },
  floors: { icon: "list", tone: "warning", labelKey: "tagesplan.hintFloors" },
  level: { icon: "star", tone: "warning", labelKey: "tagesplan.hintLevel" },
  unassigned: { icon: "circle", tone: "accent", labelKey: "tagesplan.hintUnassigned" },
};

/** Level-Konflikt aus dem Vorschlag (`buildResult`-Warnung `LEVEL1_DEMANDING`) — nur im Supervisor-/DM-Bild. */
export interface LevelWarning { code: string; hkId?: string; roomIds?: string[] }

export function planHints(input: { crew: CrewSummary[]; rooms: PlanRoom[]; levelWarnings?: LevelWarning[]; maxFloors?: number }): PlanHint[] {
  const maxFloors = input.maxFloors ?? MAX_FLOORS_HINT;
  const out: PlanHint[] = [];
  for (const c of input.crew) {
    if (c.state === "overload") out.push({ kind: "overload", crewId: c.id, name: c.name, count: c.rooms, floor: c.floors[0] });
  }
  for (const c of input.crew) {
    if (c.floors.length > maxFloors) out.push({ kind: "floors", crewId: c.id, name: c.name, count: c.floors.length, floors: c.floors, floor: c.floors[0] });
  }
  const byId = new Map(input.rooms.map((r) => [r.id, r]));
  const names = new Map(input.crew.map((c) => [c.id, c.name]));
  for (const w of input.levelWarnings ?? []) {
    if (w.code !== "LEVEL1_DEMANDING" || !w.hkId) continue;
    const r = (w.roomIds ?? []).map((id) => byId.get(id)).find(Boolean);
    // Nur, wenn die Kraft das Zimmer immer noch hat (nach Handänderung kann der Konflikt weg sein).
    if (r && r.assignedToId !== w.hkId) continue;
    out.push({ kind: "level", crewId: w.hkId, name: names.get(w.hkId) ?? "", roomIds: w.roomIds, floor: r?.floor ?? undefined });
  }
  const open = input.rooms.filter((r) => r.open);
  if (open.length) {
    const floors = [...new Set(open.map((r) => r.floor).filter((f): f is number => f != null))].sort((a, b) => a - b);
    out.push({ kind: "unassigned", count: open.length, floors, floor: floors[0], roomIds: open.map((r) => r.id) });
  }
  return out;
}

// ── Plan-Status ───────────────────────────────────────────────────────────

export const PLAN_STATES = ["proposal", "draft", "confirmed", "live"] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export const PLAN_STATE_UI: Record<PlanState, { icon: IconName; tone: Tone; labelKey: TKey }> = {
  proposal: { icon: "zap", tone: "accent", labelKey: "tagesplan.stateProposal" },
  draft: { icon: "file-text", tone: "info", labelKey: "tagesplan.stateDraft" },
  confirmed: { icon: "check", tone: "success", labelKey: "tagesplan.stateConfirmed" },
  live: { icon: "refresh", tone: "neutral", labelKey: "tagesplan.stateLive" },
};

/**
 * Plan-Status: bestätigt > Entwurf (von Hand geändert) > Vorschlag. Ohne Vorschlag (Live-Board ohne Plan des Tages) = „Live“.
 * `edits` = Zahl der Zimmer, deren Zuteilung vom Vorschlag abweicht.
 */
export function planState(p: { hasProposal: boolean; confirmed: boolean; edits: number }): PlanState {
  if (p.confirmed) return "confirmed";
  if (!p.hasProposal) return "live";
  return p.edits > 0 ? "draft" : "proposal";
}

/** Abweichungen Entwurf ↔ Vorschlag (für „Entwurf“). */
export function countEdits(proposed: Record<string, string | null>, current: Record<string, string | null>): number {
  const ids = new Set([...Object.keys(proposed), ...Object.keys(current)]);
  let n = 0;
  for (const id of ids) if ((proposed[id] ?? null) !== (current[id] ?? null)) n++;
  return n;
}

/** Zimmer einer Kraft auf einer Etage, nach Nummer — für die aufgeklappte Zeile. */
export function groupByCrew(rooms: PlanRoom[], crew: { id: string; name: string }[]): { id: string | null; name: string | null; rooms: PlanRoom[] }[] {
  const sorted = [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const groups = crew.map((c) => ({ id: c.id as string | null, name: c.name as string | null, rooms: sorted.filter((r) => r.assignedToId === c.id) })).filter((g) => g.rooms.length);
  const rest = sorted.filter((r) => !r.assignedToId || !crew.some((c) => c.id === r.assignedToId));
  if (rest.length) groups.push({ id: null, name: null, rooms: rest });
  return groups;
}
