import { prisma } from "@/lib/db";
import { parseAssignedFloors } from "@/lib/floors";
import { FLOORS } from "@/lib/domain";
import { getHousemanList, type HousemanItem } from "./housemanList";
import { isDone, listDay, loadRoomRows, type RoomRow } from "./dayRows";

export interface LiveSupervisor { id: string; name: string; floors: number[]; rooms: number; done: number; open: number; list: RoomRow[] }
export interface LiveHouseman { id: string; name: string; assigned: number; done: number }
export interface LiveOverview {
  date: string | null;
  supervisors: LiveSupervisor[];
  /** Etagen ohne Supervisor (Zimmer, die niemand prüft). */
  uncoveredFloors: number[];
  housemen: LiveHouseman[];
  /** Aufgaben für alle Hausmänner (nicht zugeteilt). */
  unassignedTasks: { total: number; done: number };
  tasks: HousemanItem[];
}

/**
 * Live-Einsicht für den Duty Manager: Supervisor-Listen (Fortschritt je Etagengruppe) und Hausmann-Liste (wer hat was,
 * was ist erledigt, von wem). Nur Zähler, Zimmernummern und Aufgabentexte der Hausmann-Traces — keine Gastnamen, nie Typ/Stufe.
 * Die Zimmermädchen-Listen liefert `getSupervisorList` (Duty Manager: alle Etagen).
 */
export async function getLiveOverview(): Promise<LiveOverview> {
  const date = await listDay();
  const sups = await prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true, name: true, assignedFloors: true }, orderBy: { name: "asc" } });
  const housemenAll = await prisma.user.findMany({ where: { role: "houseman" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const list = await getHousemanList(null, null, null);
  const allRows = date ? (await loadRoomRows(date, { floors: [...FLOORS] as number[] }, null, { extra: true })).filter((r) => r.kind !== null) : [];
  const rows = allRows.filter((r) => r.kind !== "ARRIVAL"); // Zähler: nur Zimmer mit Reinigung
  const supervisors = sups.map((s) => {
    const floors = parseAssignedFloors(s.assignedFloors);
    const mine = rows.filter((r) => floors.includes(r.floor));
    const listed = allRows.filter((r) => floors.includes(r.floor)); // Liste: auch Anreise-Zimmer (ohne Reinigung)
    const done = mine.filter((r) => isDone(r.status)).length;
    return { id: s.id, name: s.name, floors, rooms: mine.length, done, open: mine.length - done, list: listed };
  });
  const covered = new Set(supervisors.flatMap((s) => s.floors));
  const uncoveredFloors = ([...FLOORS] as number[]).filter((f) => !covered.has(f) && rows.some((r) => r.floor === f));
  const housemen = housemenAll.map((h) => {
    const mine = list.items.filter((i) => i.assignedToId === h.id);
    return { id: h.id, name: h.name, assigned: mine.length, done: mine.filter((i) => i.status === "DONE").length };
  });
  const free = list.items.filter((i) => !i.assignedToId);
  return { date, supervisors, uncoveredFloors, housemen, unassignedTasks: { total: free.length, done: free.filter((i) => i.status === "DONE").length }, tasks: list.items };
}
