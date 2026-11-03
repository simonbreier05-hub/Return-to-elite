/**
 * Anzeige-Regeln der Duty-Manager-Seite „Haus“ im Design „Glas & Premium“ (D4.1).
 * Rein und client-sicher: keine DB, keine API, kein React. Rechnet nichts Neues — die Belegung kommt aus
 * `computeDayNumbers` (`/api/day-numbers`, Inventar = Setting `roomInventory`), der Etagenfortschritt nutzt dieselbe
 * Regel wie die Kennzahl „Tagesfortschritt“ (`dailyProgress`: freigegeben von verkaufbaren Zimmern).
 * Etagen und Zimmer kommen ausschließlich aus dem vorhandenen Datenbestand — es werden keine Zimmer ergänzt.
 */
import { dailyProgress } from "@/lib/dayplan/glance";
import { FLOORS } from "@/lib/domain";

/** Belegung in ganzen Prozent; ohne Inventar 0 (nie durch 0 teilen). */
export function occupancyPercent(occupied: number, inventory: number): number {
  return inventory > 0 ? Math.round((occupied / inventory) * 100) : 0;
}

export interface FloorProgress {
  floor: number;
  /** Freigegebene (INSPECTED) Zimmer der Etage. */
  done: number;
  /** Verkaufbare Zimmer der Etage (ohne außer Betrieb/außer Service). */
  total: number;
  percent: number;
  /** Anzahl Zimmer der Etage im Board (0 = keine Zimmer im vorhandenen Grundriss/Board). */
  rooms: number;
}

/** Fortschritt je Etage, in der Reihenfolge von `FLOORS` (arabische Zahlen). Etagen ohne Zimmer bleiben mit `rooms: 0` stehen. */
export function floorProgress(rooms: { floor: number; status: string }[], floors: readonly number[] = FLOORS): FloorProgress[] {
  return floors.map((floor) => {
    const onFloor = rooms.filter((r) => r.floor === floor);
    const p = dailyProgress(onFloor);
    return { floor, done: p.inspected, total: p.sellable, percent: p.percent, rooms: onFloor.length };
  });
}
