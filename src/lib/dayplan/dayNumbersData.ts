import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import { computeDayNumbers, rowsOnFloors, PLAN_KIND as KIND, type DayNumberRow } from "./dayNumbers";

/** Zeilen für `computeDayNumbers` aus Tagesplan + Board (eine Abfrage; alle Ansichten nutzen sie). */
export async function loadDayNumberRows(date: string): Promise<DayNumberRow[]> {
  const plan = await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: true } });
  const planned = new Set(plan.map((p) => p.roomId));
  const rows: DayNumberRow[] = plan.filter((p) => KIND[p.cleaningType]).map((p) => ({
    id: p.roomId, number: p.room.number, floor: p.room.floor, kind: KIND[p.cleaningType], laundryDue: p.laundryDue, nightsKnown: p.nights != null,
    status: p.room.status, occupied: p.room.occupancy === "OCCUPIED", assignedToId: p.room.assignedToId,
    assignedToday: p.room.assignedOn === date || isStartedStatus(p.room.status),
  }));
  // Laut Board belegte Zimmer ohne Tagesplan-Eintrag zählen als belegt (nicht als zu reinigen)
  const extra = await prisma.room.findMany({ where: { occupancy: "OCCUPIED", id: { notIn: [...planned] } } });
  for (const r of extra) rows.push({ id: r.id, number: r.number, floor: r.floor, kind: "OCCUPIED", laundryDue: false, nightsKnown: false, status: r.status, occupied: true, assignedToId: r.assignedToId, assignedToday: false });
  return rows;
}

export async function getDayNumbers(date: string, team?: string[] | null) {
  const [rows, settings] = await Promise.all([loadDayNumberRows(date), getSettings()]);
  return { rows, numbers: computeDayNumbers({ rows, inventory: settings.roomInventory, team }) };
}

/**
 * Haus- und Etagenzahlen aus einer Abfrage (Supervisor-Startansicht): `floors` sind die zugeteilten Etagen. Ohne Etagen gibt es
 * keine Etagenzahlen (`mine: null`) — die Oberfläche zeigt dann einen Hinweis statt leerer oder falscher Zahlen.
 */
export async function getDayNumbersWithFloors(date: string, floors: number[], team?: string[] | null) {
  const [rows, settings] = await Promise.all([loadDayNumberRows(date), getSettings()]);
  const house = computeDayNumbers({ rows, inventory: settings.roomInventory, team });
  if (!floors.length) return { rows, numbers: house, mine: null };
  const inventory = await prisma.room.count({ where: { floor: { in: floors } } });
  return { rows, numbers: house, mine: { floors, numbers: computeDayNumbers({ rows: rowsOnFloors(rows, floors), inventory, team }) } };
}
