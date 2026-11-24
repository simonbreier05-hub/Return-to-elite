import { now as clockNow } from "@/lib/clock";
import { loadRoomRows, isDone, listDay, type RoomRow } from "./dayRows";
import { listTier, sortByListOrder } from "@/lib/planung/listOrder";
import { berlinHHMM } from "@/lib/dayplan/time";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export interface HousekeeperList {
  date: string | null;
  progress: { done: number; total: number; creditsDone: number; creditsTotal: number };
  rooms: RoomRow[];
  /** F6 (Block 1.2): Schichtende „HH:MM“ (Arbeitsbeginn + Schichtdauer) für den Hinweis „über Schichtende“. */
  shiftEnd?: string;
  /** F6 (Block 1.4): heute krank/abwesend gemeldet — „Du bist heute abgemeldet“. */
  absentToday?: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Zimmermädchen-Liste: nur die eigenen Zimmer, Traces nur der Abteilung Housekeeping, Gast nur als „Anrede Titel Nachname".
 * Planung L1 (Regel 7): Reihenfolge nach `listTier` (Rush → Service Now → Turn ausgecheckt → Bleiber → Turn noch belegt →
 * Abreise → „Reinigung ab …“), innerhalb der Stufe Laufplan (`routeOrder`, per Drag manuell änderbar).
 */
export async function getHousekeeperList(userId: string, now: Date = clockNow()): Promise<HousekeeperList> {
  const date = await listDay();
  if (!date) return { date: null, progress: { done: 0, total: 0, creditsDone: 0, creditsTotal: 0 }, rooms: [] };
  // Nur heutige Arbeit: Zimmer mit Tagesplan oder heute zugeteilt (alte Zuteilungen bleiben außen vor)
  const loaded = (await loadRoomRows(date, { assignedToId: userId }, ["HOUSEKEEPING"])).filter((r) => r.kind !== null || r.assignedOn === date);
  const hhmm = berlinHHMM(now);
  const rows = sortByListOrder(loaded, (r) => listTier(r, hhmm));
  // Zimmer ohne Reinigung heute (reine Anreise ohne Vorbereitung) zählen nicht in den Fortschritt
  const work = rows.filter((r) => r.kind !== "ARRIVAL" || r.credits > 0);
  const [s, me] = await Promise.all([getSettings(), prisma.user.findUnique({ where: { id: userId }, select: { sickDate: true, absentDate: true } })]);
  const endMin = s.workStartHour * 60 + s.shiftMinutes;
  const shiftEnd = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return {
    date,
    shiftEnd,
    absentToday: me?.sickDate === date || me?.absentDate === date,
    progress: {
      done: work.filter((r) => isDone(r.status)).length,
      total: work.length,
      creditsDone: round(work.filter((r) => isDone(r.status)).reduce((a, r) => a + r.credits, 0)),
      creditsTotal: round(work.reduce((a, r) => a + r.credits, 0)),
    },
    rooms: rows,
  };
}
