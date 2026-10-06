/**
 * Reine Logik des Planungstools (/planung): Haus-Kacheln, Etagenbalken, Stepper- und Dateizustände.
 * Keine DB, kein React — dadurch testbar und von Server und Client gleich genutzt.
 */

export type TileKind = "DEPARTURE" | "TURN" | "STAYOVER" | "ARRIVAL" | "EMPTY";

export interface HouseTile {
  number: string;
  kind: TileKind;
  vip?: boolean;
  laundry?: boolean;
  /** Anreisezeit "HH:MM" (Turn/Anreise). Keine Gastdaten. */
  eta?: string | null;
  openTraces?: number;
}
export interface HouseFloor { floor: number; tiles: HouseTile[] }
export interface HouseSupervisor { letter: string; tone: 1 | 2 | 3; name: string }
export interface HouseData {
  date: string | null;
  hasData: boolean;
  floors: HouseFloor[];
  /** Etage → Supervisor-Badge (leer = gestrichelter Kreis). */
  supervisors: Record<number, HouseSupervisor | undefined>;
}

/** Etage 5 oben, Etage 1 unten. */
export const FLOOR_ORDER = [5, 4, 3, 2, 1] as const;
/** Höchste Spaltenzahl der Kachelleiste (Etage mit den meisten Zimmern). */
export const MAX_TILE_COLUMNS = 33;

export interface FloorStats {
  floor: number;
  total: number;
  /** Belegt = Abreise + Same-Day-Turn + Bleiber (laut DayRoomPlan). */
  occupied: number;
  departures: number; // Abreisen inkl. Turns
  turns: number;
  stayovers: number;
  arrivals: number; // Anreisen inkl. Turns
  /** 0..1 — Anteil belegter Zimmer an allen Zimmern der Etage. */
  ratio: number;
}

export function floorStats(f: HouseFloor): FloorStats {
  const count = (k: TileKind) => f.tiles.filter((t) => t.kind === k).length;
  const dep = count("DEPARTURE"), turn = count("TURN"), stay = count("STAYOVER"), arr = count("ARRIVAL");
  const total = f.tiles.length;
  const occupied = dep + turn + stay;
  return { floor: f.floor, total, occupied, departures: dep + turn, turns: turn, stayovers: stay, arrivals: arr + turn, ratio: total ? occupied / total : 0 };
}

export function houseTotals(floors: HouseFloor[]) {
  const s = floors.map(floorStats);
  return {
    occupied: s.reduce((a, x) => a + x.occupied, 0),
    departures: s.reduce((a, x) => a + x.departures, 0),
    arrivals: s.reduce((a, x) => a + x.arrivals, 0),
    total: s.reduce((a, x) => a + x.total, 0),
  };
}

/** Etagen in Anzeigereihenfolge (5 → 1); fehlende Etagen werden leer ergänzt. */
export function orderedFloors(floors: HouseFloor[]): HouseFloor[] {
  return FLOOR_ORDER.map((n) => floors.find((f) => f.floor === n) ?? { floor: n, tiles: [] });
}

/** Zeilenkennzeichen für Kachel-Animation: Welle von oben nach unten, Versatz je Kachel (ms). */
export function waveDelay(floorRowIndex: number, tileIndex: number): number {
  return floorRowIndex * 140 + tileIndex * 14;
}

/** Barrierefreie Beschreibung einer Kachel (Zimmernummer + Art, keine Gastdaten). */
export const TILE_LABEL_DE: Record<TileKind, string> = {
  DEPARTURE: "Abreise", TURN: "Same-Day-Turn", STAYOVER: "Bleiber", ARRIVAL: "Anreise", EMPTY: "leer",
};

// ── Stepper ────────────────────────────────────────────────────────────────
export type StepId = 1 | 2 | 3 | 4;
export type StepState = "done" | "current" | "upcoming";

/** Zustand eines Schritts. Bis `reached` darf man zurückspringen; weiter nur über den Hauptbutton. */
export function stepState(step: StepId, current: StepId): StepState {
  return step < current ? "done" : step === current ? "current" : "upcoming";
}
export const canGoTo = (step: StepId, current: StepId, reached: StepId) => step <= Math.max(current, reached);

// ── Dateien (Schritt 1) ───────────────────────────────────────────────────
export type FileStatus = "waiting" | "reading" | "read" | "warning" | "error" | "applied";

export interface FileStatusInput {
  phase: "waiting" | "reading" | "read" | "error" | "applied" | "discarded" | null;
  severities: ("CRITICAL" | "WARNING" | "INFO")[];
}
export function fileStatus(i: FileStatusInput): FileStatus {
  if (!i.phase || i.phase === "discarded") return "waiting";
  if (i.phase === "applied") return "applied";
  if (i.phase === "error") return "error";
  if (i.phase === "waiting" || i.phase === "reading") return i.phase;
  if (i.severities.includes("CRITICAL")) return "error";
  return i.severities.includes("WARNING") ? "warning" : "read";
}

/** Darf es mit dem Hauptbutton weitergehen? Departures müssen übernommen sein (sonst gibt es keinen Tagesplan). */
export function listsReady(applied: Record<string, boolean>): boolean {
  return !!applied.DEPARTURES;
}

/** "DIENSTAG, 22.09.2026" — Kalendertag unabhängig von der Zeitzone des Rechners. */
export function dateLabel(iso: string | null, locale = "de-DE"): string {
  const d = iso ? new Date(`${iso}T12:00:00Z`) : new Date();
  return d.toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: iso ? "UTC" : "Europe/Berlin" }).replace(", ", ", ").toUpperCase();
}
