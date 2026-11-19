import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import { computeDayNumbers, rowsOnFloors, unplannedKind, PLAN_KIND as KIND, type DayNumberRow } from "./dayNumbers";

/** Zeilen für `computeDayNumbers` aus Tagesplan + Board (eine Abfrage; alle Ansichten nutzen sie). */
export async function loadDayNumberRows(date: string): Promise<DayNumberRow[]> {
  const plan = await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: true } });
  const planned = new Set(plan.map((p) => p.roomId));
  const rows: DayNumberRow[] = plan.filter((p) => KIND[p.cleaningType]).map((p) => ({
    id: p.roomId, number: p.room.number, floor: p.room.floor, kind: KIND[p.cleaningType], laundryDue: p.laundryDue, nightsKnown: p.nights != null,
    status: p.room.status, occupied: p.room.occupancy === "OCCUPIED", assignedToId: p.room.assignedToId,
    assignedToday: p.room.assignedOn === date || isStartedStatus(p.room.status),
  }));
  // Zimmer ohne Tagesplan-Eintrag: heute zugeteilt und nicht fertig → „Zusatz“ (zu reinigen, K3);
  // sonst laut Board belegt → zählt nur als belegt (nicht als zu reinigen)
  const extra = await prisma.room.findMany({ where: { id: { notIn: [...planned] }, OR: [{ occupancy: "OCCUPIED" }, { assignedOn: date, assignedToId: { not: null } }] } });
  for (const r of extra) {
    const assignedToday = r.assignedOn === date || isStartedStatus(r.status);
    const kind = unplannedKind({ status: r.status, assignedToId: r.assignedToId, assignedToday }) ?? (r.occupancy === "OCCUPIED" ? "OCCUPIED" : null);
    if (!kind) continue;
    rows.push({ id: r.id, number: r.number, floor: r.floor, kind, laundryDue: false, nightsKnown: false, status: r.status, occupied: r.occupancy === "OCCUPIED", assignedToId: r.assignedToId, assignedToday: kind === "EXTRA" });
  }
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
