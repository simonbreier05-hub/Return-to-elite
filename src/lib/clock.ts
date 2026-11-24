/**
 * S0 Simulationsuhr — die EINZIGE Zeitquelle für Geschäftslogik: `now()` / `nowMs()`.
 *
 * Ohne Simulation = echte Zeit, unverändert. Mit Simulation (nur Preview/lokal, nie Produktion):
 *   sim = pausiert ? simAnker : simAnker + (echtJetzt − echtAnker) × faktor
 *
 * Der Zustand liegt auf `globalThis.__simClock` (Next bündelt Module je Route getrennt; globalThis ist je Prozess
 * eins). Server: server.js lädt ihn beim Start aus der Tabelle SimClock (src/lib/clockStore.ts), POST /api/sim/clock
 * ändert ihn. Browser: SimClockSync setzt ihn aus GET /api/sim/clock bzw. dem Socket-Ereignis `clock:update`
 * (echtAnker dort schon um den Uhrenversatz Server↔Gerät korrigiert).
 *
 * Doppelte Sperre auf dem Server (`simulationAllowed`): SIMULATION_MODE=true UND SIM_ALLOWED=preview — und nie im
 * Railway-Produktionsdienst. Ohne beides liefert `now()` echte Zeit, selbst wenn ein Zustand gesetzt wäre.
 * Datei bewusst ohne Imports, damit sie in jedem Bündel (Server, Client, server.js-Tests) gleich läuft.
 */

export interface SimState {
  /** Sim-Zeitpunkt (ms) am echten Zeitpunkt echtAnker. */
  simAnker: number;
  /** Echter Zeitpunkt (ms), an dem simAnker galt. */
  echtAnker: number;
  /** Zeitraffer: 1 = Echtzeit, 3 = dreifach. */
  faktor: number;
  pausiert: boolean;
}

export type ClockCommand =
  | { cmd: "set"; at: number }
  | { cmd: "faktor"; faktor: number }
  | { cmd: "pause" }
  | { cmd: "weiter" }
  | { cmd: "naechster-tag"; hhmm: string }
  | { cmd: "echt" };

declare global {
  // eslint-disable-next-line no-var
  var __simClock: SimState | null | undefined;
}

/** Name des Railway-Produktionsdienstes — dort nie Simulation, auch wenn die Variablen versehentlich gesetzt sind. */
export const PRODUCTION_SERVICE_NAMES: ReadonlySet<string> = new Set(["StayClean"]);

/** Doppelte Sperre: nur mit SIMULATION_MODE=true UND SIM_ALLOWED=preview, nie im Produktionsdienst. */
export function simulationAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.SIMULATION_MODE !== "true") return false;
  if (env.SIM_ALLOWED !== "preview") return false;
  if (env.RAILWAY_SERVICE_NAME && PRODUCTION_SERVICE_NAMES.has(env.RAILWAY_SERVICE_NAME)) return false;
  if (env.RAILWAY_ENVIRONMENT_NAME === "production" && !env.RAILWAY_SERVICE_NAME?.toLowerCase().includes("preview")) return false;
  return true;
}

const isServer = typeof window === "undefined";

/** Aktiver Sim-Zustand oder null (= echte Zeit). */
export function simState(): SimState | null {
  const s = globalThis.__simClock ?? null;
  if (!s) return null;
  if (isServer && !simulationAllowed()) return null;
  return s;
}

export function setSimState(s: SimState | null): void {
  globalThis.__simClock = s;
}

/** Sim-Zeit (ms) zu einem echten Zeitpunkt — rein, testbar. */
export function simMsAt(s: SimState, echtMs: number): number {
  return s.pausiert ? s.simAnker : s.simAnker + (echtMs - s.echtAnker) * s.faktor;
}

/** Aktuelle Geschäftszeit in ms. */
export function nowMs(): number {
  const real = Date.now();
  const s = simState();
  return s ? Math.round(simMsAt(s, real)) : real;
}

/** Aktuelle Geschäftszeit. */
export function now(): Date {
  return new Date(nowMs());
}

/** Startzustand: Sim = echte Zeit, Faktor 1. */
export function initialState(echtMs: number): SimState {
  return { simAnker: echtMs, echtAnker: echtMs, faktor: 1, pausiert: false };
}

/** Kalendertag + Uhrzeit in Berlin → UTC-ms (gleiche Logik wie dayplan/time.ts berlinToUtc, hier ohne Import). */
export function berlinMs(date: string, hhmm: string): number {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess.getTime() - (asUtc - guess.getTime());
}

/** "2026-12-07T07:00" oder "2026-12-07 07:00" (Berlin) → ms; NaN bei falschem Format. */
export function parseBerlinLocal(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(s.trim());
  return m ? berlinMs(m[1], m[2]) : NaN;
}

const berlinDay = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Befehl anwenden — rein, testbar. Jeder Befehl setzt den Anker neu, damit die Sim-Zeit nie springt (außer set/naechster-tag). */
export function applyCommand(prev: SimState | null, c: ClockCommand, echtMs: number): SimState {
  const base = prev ?? initialState(echtMs);
  const cur = simMsAt(base, echtMs);
  switch (c.cmd) {
    case "set":
      return { ...base, simAnker: c.at, echtAnker: echtMs };
    case "faktor":
      return { ...base, simAnker: cur, echtAnker: echtMs, faktor: c.faktor };
    case "pause":
      return { ...base, simAnker: cur, echtAnker: echtMs, pausiert: true };
    case "weiter":
      return { ...base, simAnker: cur, echtAnker: echtMs, pausiert: false };
    case "naechster-tag": {
      const next = new Date(berlinMs(berlinDay(cur), "12:00") + 24 * 3_600_000); // Mittag: sicher über Sommer-/Winterzeit
      return { ...base, simAnker: berlinMs(berlinDay(next.getTime()), c.hhmm), echtAnker: echtMs };
    }
    case "echt":
      return initialState(echtMs);
  }
}

/** Banner-Text: „SIMULATION · Mo 07.12. 07:42 · ×3“ bzw. „· pausiert“. */
export function bannerText(s: SimState, simMs: number): string {
  const d = new Date(simMs);
  const wd = d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "short" }).replace(".", "");
  const dm = d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
  const hm = d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `SIMULATION · ${wd} ${dm.endsWith(".") ? dm : `${dm}.`} ${hm} · ${s.pausiert ? "pausiert" : `×${s.faktor}`}`;
}
