import { prisma } from "@/lib/db";
import { berlinDate } from "@/lib/dayplan/time";

/**
 * F2: gesperrte Zimmer („Außer Betrieb“, Altbestand „Nicht im Service“) für die Kachel „Gesperrte Zimmer“ auf den Startseiten von
 * Duty Manager, Supervisor und Front Office. Nur Zimmer, Grund, Dauer, Belegung/Anreise — keine Gastdaten.
 * `readyForRelease`: alle Technik-Aufträge des Zimmers erledigt (mindestens einer) → „Bereit zur Freigabe“.
 */
export interface BlockedRoom {
  id: string; number: string; floor: number; status: string; reason: string | null; until: string | null; since: string | null;
  expired: boolean; occupied: boolean; arrivalToday: boolean; readyForRelease: boolean;
}

export async function loadBlockedRooms(now = new Date(), floors?: number[] | null): Promise<BlockedRoom[]> {
  const date = berlinDate(now);
  const rooms = await prisma.room.findMany({
    where: { status: { in: ["OUT_OF_ORDER", "OUT_OF_SERVICE"] }, ...(floors?.length ? { floor: { in: floors } } : {}) },
    orderBy: { number: "asc" },
    select: { id: true, number: true, floor: true, status: true, oooReason: true, oooUntil: true, oooSince: true, statusSince: true, occupancy: true },
  });
  const ids = rooms.map((r) => r.id);
  const [arrivals, plans, orders] = await Promise.all([
    prisma.arrival.findMany({ where: { roomId: { in: ids }, status: "EXPECTED" }, select: { roomId: true } }),
    prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: ids }, cleaningType: { in: ["ARRIVAL", "SAME_DAY_TURN"] } }, select: { roomId: true } }),
    prisma.workOrder.findMany({ where: { defect: { roomId: { in: ids } } }, select: { status: true, defect: { select: { roomId: true } } } }),
  ]);
  const arriving = new Set([...arrivals, ...plans].map((a) => a.roomId));
  const ordersBy = new Map<string, string[]>();
  for (const o of orders) ordersBy.set(o.defect.roomId, [...(ordersBy.get(o.defect.roomId) ?? []), o.status]);
  return rooms.map((r) => {
    const os = ordersBy.get(r.id) ?? [];
    return {
      id: r.id, number: r.number, floor: r.floor, status: r.status, reason: r.oooReason,
      until: r.oooUntil?.toISOString() ?? null, since: (r.oooSince ?? r.statusSince).toISOString(),
      expired: !!r.oooUntil && r.oooUntil < now, occupied: r.occupancy === "OCCUPIED", arrivalToday: arriving.has(r.id),
      readyForRelease: os.length > 0 && os.every((s) => s === "RESOLVED"),
    };
  });
}
