import type { PlanRoom } from "./types";

/**
 * Reihenfolge in der Route bei Zeitdruck (Interview): 1. Same-Day-Turn (nach Anreisezeit),
 * 2. frühe Anreise, 3. VIP, 4. Abreisen vor Bleibern. Innerhalb einer Stufe Etage → Nummer,
 * damit die Route trotzdem ein vernünftiger Gang bleibt.
 * "Frühe Anreise" = Turn mit bekannter, früher Anreisezeit: sie stehen durch die ETA-Sortierung
 * innerhalb der Turns ganz vorn; Zimmer ohne bekannte ETA (Arrivals-Liste fehlt) kommen danach.
 */
function tier(r: PlanRoom): number {
  if (r.kind === "TURN") return 0;
  if (r.vip) return 1;
  if (r.kind === "DEPARTURE") return 2;
  return 3;
}

const etaKey = (eta: string | null) => (eta ?? "99:99");

export function orderRoute<T extends PlanRoom>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) =>
    tier(a) - tier(b) ||
    (tier(a) === 0 ? etaKey(a.eta).localeCompare(etaKey(b.eta)) : 0) ||
    a.floor - b.floor || a.number.localeCompare(b.number),
  );
}
