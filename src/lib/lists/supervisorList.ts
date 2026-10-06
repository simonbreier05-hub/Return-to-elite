import { prisma } from "@/lib/db";
import { FLOORS } from "@/lib/domain";
import { parseAssignedFloors } from "@/lib/floors";
import { isDone, listDay, loadRoomRows, type RoomRow } from "./dayRows";
import { groupOf, GROUP_ORDER, type RoomGroup } from "./groups";

export interface SupRoom extends RoomRow { group: RoomGroup; changed: boolean }
export interface SupHousekeeper {
  id: string; name: string; dailyNumber: number | null;
  progress: { done: number; total: number; credits: number; creditsDone: number };
  rooms: SupRoom[];
}
export interface SupervisorList {
  date: string | null;
  /** Etagen, für die diese Liste gilt. Leer = dem Supervisor ist noch keine Etage zugeteilt. */
  floors: number[];
  noFloors: boolean;
  /** Stand der Daten: jüngste übernommene Liste des Tages. */
  dataAsOf: string | null;
  housekeepers: SupHousekeeper[];
  unassigned: SupRoom[];
  /** Housekeeper, an die Zimmer verschoben werden können. */
  attendants: { id: string; name: string; dailyNumber: number | null }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Etagen, für die eine Rolle die Liste sehen darf: Supervisor nur die eigenen, Duty Manager alle. */
export async function floorsFor(session: { userId: string; role: string }, requested?: number[]): Promise<number[]> {
  if (session.role === "supervisor") {
    const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { assignedFloors: true } });
    return parseAssignedFloors(u?.assignedFloors); // Wunsch-Etagen werden ignoriert — nie fremde Etagen
  }
  const all = [...FLOORS] as number[];
  return requested?.length ? all.filter((f) => requested.includes(f)) : all;
}

/** Gestern/heute: welche Zimmer hat der letzte Nachimport des Tages geändert? (nur bei einem echten Nachimport, nicht beim ersten Import) */
async function changedByReimport(date: string): Promise<Set<string>> {
  const merges = await prisma.auditLog.findMany({ where: { action: "DAY_PLAN_MERGED" }, orderBy: { createdAt: "desc" }, take: 20 });
  const mine = merges.map((m) => { try { return JSON.parse(m.meta ?? "{}") as { date?: string; changedRooms?: string[]; first?: boolean }; } catch { return {}; } }).filter((m) => m.date === date);
  const latest = mine[0];
  return latest && !latest.first ? new Set(latest.changedRooms ?? []) : new Set();
}

async function dataAsOf(): Promise<string | null> {
  const batches = await Promise.all((["DEPARTURES", "ARRIVALS", "TRACES"] as const).map((type) => prisma.importBatch.findFirst({ where: { type, status: "APPLIED" }, orderBy: { appliedAt: "desc" }, select: { appliedAt: true } })));
  const times = batches.map((b) => b?.appliedAt?.getTime() ?? 0);
  const max = Math.max(...times);
  return max > 0 ? new Date(max).toISOString() : null;
}

/**
 * Supervisor-Liste: entsteht aus den Zimmermädchen-Listen, nur für die zugeteilten Etagen.
 * Je Housekeeper Fortschritt + Credits + Zimmer in Gruppen; Traces aller Abteilungen; „durch Nachimport geändert".
 */
export async function getSupervisorList(session: { userId: string; role: string }, requestedFloors?: number[]): Promise<SupervisorList> {
  const floors = await floorsFor(session, requestedFloors);
  const date = await listDay();
  const attendantsAll = await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, dailyNumber: true } });
  const base = { date, floors, noFloors: floors.length === 0, dataAsOf: await dataAsOf(), attendants: attendantsAll };
  if (!date || floors.length === 0) return { ...base, housekeepers: [], unassigned: [] };

  const changed = await changedByReimport(date);
  const rows = (await loadRoomRows(date, { floors }, null))
    .filter((r) => r.kind !== null || (r.assignedToId && r.assignedOn === date))
    .map((r): SupRoom => ({ ...r, group: groupOf(r), changed: changed.has(r.number) }));
  rows.sort((a, b) => (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity) || a.number.localeCompare(b.number));

  const byHk = new Map<string, SupRoom[]>();
  const unassigned: SupRoom[] = [];
  for (const r of rows) {
    if (r.assignedToId && (r.assignedOn === date || isDone(r.status) || r.status === "IN_PROGRESS")) byHk.set(r.assignedToId, [...(byHk.get(r.assignedToId) ?? []), r]);
    else if (r.kind !== "ARRIVAL") unassigned.push(r);
  }
  const names = new Map(attendantsAll.map((a) => [a.id, a]));
  const housekeepers: SupHousekeeper[] = [...byHk.entries()].map(([id, rs]) => {
    const work = rs.filter((r) => r.credits > 0 || r.kind !== "ARRIVAL");
    const sorted = [...rs].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity));
    return {
      id, name: names.get(id)?.name ?? "—", dailyNumber: names.get(id)?.dailyNumber ?? null,
      progress: {
        done: work.filter((r) => isDone(r.status)).length, total: work.length,
        credits: round(work.reduce((a, r) => a + r.credits, 0)), creditsDone: round(work.filter((r) => isDone(r.status)).reduce((a, r) => a + r.credits, 0)),
      },
      rooms: sorted,
    };
  }).sort((a, b) => (a.dailyNumber ?? 999) - (b.dailyNumber ?? 999) || a.name.localeCompare(b.name));
  return { ...base, housekeepers, unassigned };
}
