import type { PlanRoom } from "./types";

/**
 * Reihenfolge der Route beim Planen (Planung L1, Meeting 13.11.2026 — VIP ist keine eigene Stufe mehr):
 * 1. Turn (nach Anreisezeit, frühe Anreisen zuerst), 2. Bleiber (mit oder ohne Wäschewechsel), 3. Abreise/Deep clean.
 * Innerhalb einer Stufe Etage → Nummer, damit die Route ein vernünftiger Gang bleibt.
 * Die Live-Reihenfolge der Housekeeper-Liste (Rush, Service Now, „Turn nur wenn ausgecheckt“, „Reinigung ab …“) steht in
 * `src/lib/planung/listOrder.ts` — sie kennt Signale, die es beim Planen am Morgen noch nicht gibt.
 */
function tier(r: PlanRoom): number {
  if (r.kind === "TURN") return 0;
  if (r.kind === "STAYOVER") return 1;
  return 2; // DEPARTURE = Deep clean: niemand wartet auf das Zimmer
}

const etaKey = (eta: string | null) => (eta ?? "99:99");

export function orderRoute<T extends PlanRoom>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) =>
    tier(a) - tier(b) ||
    (tier(a) === 0 ? etaKey(a.eta).localeCompare(etaKey(b.eta)) : 0) ||
    a.floor - b.floor || a.number.localeCompare(b.number),
  );
}
