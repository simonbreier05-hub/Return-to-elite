import { prisma } from "@/lib/db";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { supervisorBadges, type HouseData, type HouseTile, type TileKind } from "./model";

const KIND: Record<string, TileKind> = { DEPARTURE: "DEPARTURE", SAME_DAY_TURN: "TURN", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL" };

/**
 * Haus-Ansicht: eine Kachel je Zimmer, Art laut `DayRoomPlan`. Eine gemeinsame Abfrage für Kacheln,
 * Etagenbalken und Kennzahlen. Vor dem ersten Import: leere Kacheln, `hasData = false`.
 * Keine Gastdaten (weder Namen noch Reservierungen).
 */
export async function getHouseData(date?: string | null): Promise<HouseData> {
  // Tag der letzten übernommenen Departures; ohne Batch (z. B. Tagesplan von Hand) der jüngste vorhandene Tagesplan
  const day = date ?? (await latestPlanDate()) ?? (await prisma.dayRoomPlan.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date ?? null;
  const rooms = await prisma.room.findMany({ select: { id: true, number: true, floor: true }, orderBy: { number: "asc" } });
  const plan = day ? await prisma.dayRoomPlan.findMany({ where: { date: day } }) : [];
  const byRoom = new Map(plan.map((p) => [p.roomId, p]));
  const traces = await prisma.trace.groupBy({ by: ["roomId"], where: { status: "OPEN" }, _count: true });
  const traceCount = new Map(traces.map((t) => [t.roomId, t._count]));

  const floors = new Map<number, HouseTile[]>();
  for (const r of rooms) {
    const p = byRoom.get(r.id);
    const tile: HouseTile = { number: r.number, kind: p ? KIND[p.cleaningType] ?? "EMPTY" : "EMPTY" };
    if (p) { tile.vip = p.vip; tile.laundry = p.laundryDue; tile.eta = p.eta; tile.openTraces = traceCount.get(r.id) ?? 0; }
    floors.set(r.floor, [...(floors.get(r.floor) ?? []), tile]);
  }

  // Supervisor je Etage aus der bestehenden Etagenzuweisung (User.assignedFloors)
  const sups = await prisma.user.findMany({ where: { role: "supervisor" }, orderBy: { name: "asc" }, select: { id: true, name: true, assignedFloors: true } });
  const badges = supervisorBadges(sups);
  const supervisors: HouseData["supervisors"] = {};
  for (const s of sups) {
    for (const f of s.assignedFloors.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n))) supervisors[f] = badges[s.id];
  }

  return {
    date: day,
    hasData: plan.length > 0,
    floors: [...floors.entries()].sort(([a], [b]) => a - b).map(([floor, tiles]) => ({ floor, tiles })),
    supervisors,
  };
}
