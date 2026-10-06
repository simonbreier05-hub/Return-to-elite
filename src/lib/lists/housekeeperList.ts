import { loadRoomRows, isDone, listDay, type RoomRow } from "./dayRows";

export interface HousekeeperList {
  date: string | null;
  progress: { done: number; total: number; creditsDone: number; creditsTotal: number };
  rooms: RoomRow[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Zimmermädchen-Liste: nur die eigenen Zimmer, in Laufplan-Reihenfolge (`routeOrder`, per Drag manuell änderbar),
 * Traces nur der Abteilung Housekeeping, Gast nur als „Anrede Titel Nachname".
 */
export async function getHousekeeperList(userId: string): Promise<HousekeeperList> {
  const date = await listDay();
  if (!date) return { date: null, progress: { done: 0, total: 0, creditsDone: 0, creditsTotal: 0 }, rooms: [] };
  // Nur heutige Arbeit: Zimmer mit Tagesplan oder heute zugeteilt (alte Zuteilungen bleiben außen vor)
  const rows = (await loadRoomRows(date, { assignedToId: userId }, ["HOUSEKEEPING"])).filter((r) => r.kind !== null || r.assignedOn === date);
  rows.sort((a, b) => (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity) || a.number.localeCompare(b.number));
  // Zimmer ohne Reinigung heute (reine Anreise ohne Vorbereitung) zählen nicht in den Fortschritt
  const work = rows.filter((r) => r.kind !== "ARRIVAL" || r.credits > 0);
  return {
    date,
    progress: {
      done: work.filter((r) => isDone(r.status)).length,
      total: work.length,
      creditsDone: round(work.filter((r) => isDone(r.status)).reduce((a, r) => a + r.credits, 0)),
      creditsTotal: round(work.reduce((a, r) => a + r.credits, 0)),
    },
    rooms: rows,
  };
}
