import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { applyCommand, nowMs, setSimState, simState, simulationAllowed, type ClockCommand, type SimState } from "@/lib/clock";

/**
 * S0: Uhrzustand in der DB (Tabelle SimClock, Zeile id=1) lesen/schreiben und an alle senden.
 * Nur Server. Ohne Simulation (Produktion) tut hier nichts etwas — kein DB-Zugriff.
 */

export interface ClockInfo {
  active: boolean;
  /** Zustand für den Client; null = echte Zeit. */
  state: SimState | null;
  /** Echte Serverzeit beim Antworten — der Client rechnet damit seinen Uhrenversatz heraus. */
  serverEcht: number;
  simNow: number;
}

export function clockInfo(): ClockInfo {
  const active = simulationAllowed();
  return { active, state: active ? simState() : null, serverEcht: Date.now(), simNow: nowMs() };
}

/** Beim Start bzw. vor dem ersten Befehl: Zustand aus der DB übernehmen. */
export async function loadClockFromDb(): Promise<SimState | null> {
  if (!simulationAllowed()) return null;
  const row = await prisma.simClock.findUnique({ where: { id: 1 } });
  const s = row ? { simAnker: row.simAnker.getTime(), echtAnker: row.echtAnker.getTime(), faktor: row.faktor, pausiert: row.pausiert } : null;
  setSimState(s);
  return s;
}

/** Nach einem Neustart einmal aus der DB laden (server.js ruft GET /api/sim/clock gleich nach dem Start). */
export async function ensureClockLoaded(): Promise<void> {
  if (simulationAllowed() && globalThis.__simClock === undefined) await loadClockFromDb();
}

/** Steuer-Token prüfen (zeitkonstant). Ohne gesetztes Token (oder zu kurz) nie erlaubt. */
export function simTokenOk(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || expected.length < 16) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Befehl anwenden, speichern, an alle senden (`clock:update`). */
export async function runClockCommand(c: ClockCommand): Promise<ClockInfo> {
  const s = applyCommand(simState(), c, Date.now());
  const data = { simAnker: new Date(s.simAnker), echtAnker: new Date(s.echtAnker), faktor: s.faktor, pausiert: s.pausiert };
  await prisma.simClock.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  setSimState(s);
  const info = clockInfo();
  broadcast("clock:update", info);
  return info;
}
