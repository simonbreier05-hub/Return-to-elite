import { now as clockNow } from "@/lib/clock";
import { prisma } from "@/lib/db";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";

/**
 * F2: gesperrte Zimmer („Außer Betrieb“, Altbestand „Nicht im Service“) für die Kachel „Gesperrte Zimmer“ auf den Startseiten von
 * Duty Manager, Supervisor und Front Office. Nur Zimmer, Grund, Dauer, Belegung/Anreise — keine Gastdaten.
 * `readyForRelease`: alle Technik-Aufträge des Zimmers erledigt (mindestens einer) → „Bereit zur Freigabe“.
 */
export interface BlockedRoom {
  id: string; number: string; floor: number; status: string; reason: string | null; until: string | null; since: string | null;
  expired: boolean; occupied: boolean; arrivalToday: boolean; readyForRelease: boolean;
}

/** Erwartete Anreise HEUTE (ETA am Betriebstag, oder ohne ETA heute angelegt) — alte Einträge lösen keine Rückfrage aus. */
export function arrivalTodayWhere(now = clockNow()) {
  const from = berlinToUtc(berlinDate(now), "00:00"), to = new Date(from.getTime() + 86_400_000);
  return { status: "EXPECTED", OR: [{ eta: { gte: from, lt: to } }, { eta: null, createdAt: { gte: from } }] };
}

export async function loadBlockedRooms(now = clockNow(), floors?: number[] | null): Promise<BlockedRoom[]> {
  const date = berlinDate(now);
  const rooms = await prisma.room.findMany({
    where: { status: { in: ["OUT_OF_ORDER", "OUT_OF_SERVICE"] }, ...(floors?.length ? { floor: { in: floors } } : {}) },
    orderBy: { number: "asc" },
    select: { id: true, number: true, floor: true, status: true, oooReason: true, oooUntil: true, oooSince: true, statusSince: true, occupancy: true },
  });
  const ids = rooms.map((r) => r.id);
  const [arrivals, plans, orders] = await Promise.all([
    prisma.arrival.findMany({ where: { roomId: { in: ids }, ...arrivalTodayWhere(now) }, select: { roomId: true } }),
    prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: ids }, cleaningType: { in: ["ARRIVAL", "SAME_DAY_TURN"] } }, select: { roomId: true } }),
    prisma.workOrder.findMany({ where: { defect: { roomId: { in: ids } } }, select: { status: true, resolvedAt: true, defect: { select: { roomId: true } } } }),
  ]);
  const arriving = new Set([...arrivals, ...plans].map((a) => a.roomId));
  // „Bereit zur Freigabe“ zählt nur Aufträge dieser Sperre: offene oder seit Beginn der Sperre erledigte (nicht alte)
  const sinceOf = new Map(rooms.map((r) => [r.id, r.oooSince ?? r.statusSince]));
  const ordersBy = new Map<string, string[]>();
  for (const o of orders) {
    if (o.status === "RESOLVED" && (!o.resolvedAt || o.resolvedAt < sinceOf.get(o.defect.roomId)!)) continue;
    ordersBy.set(o.defect.roomId, [...(ordersBy.get(o.defect.roomId) ?? []), o.status]);
  }
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
