import { prisma } from "@/lib/db";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { getRoomTypeCredits, getSettings } from "@/lib/settings";
import type { RoomType } from "@/lib/domain";
import { creditFactor } from "@/lib/rooms/stayoverCredit";
import { shortGuestName, timesInText } from "./guestName";

/** Tag der Listen: zuletzt übernommene Departures, sonst der jüngste vorhandene Tagesplan. */
export async function listDay(): Promise<string | null> {
  return (await latestPlanDate()) ?? (await prisma.dayRoomPlan.findFirst({ orderBy: { date: "desc" }, select: { date: true } }))?.date ?? null;
}

export type Kind = "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL";

export interface TraceView { id: string; code: string; text: string; dept: string; status: string }

export interface RoomRow {
  id: string;
  number: string;
  floor: number;
  status: string;
  routeOrder: number | null;
  assignedToId: string | null;
  assignedOn: string | null;
  occupancy: string;
  blockReason: string | null;
  kind: Kind | null;
  laundry: boolean;
  vip: boolean;
  eta: string | null;
  /** „Herr Dr. Krüger" / „Mr. Smith" / nur „Krüger" — nie Vornamen, nie Alter. */
  guest: string | null;
  pax: number | null;
  dnd: boolean;
  credits: number;
  traces: TraceView[];
}

/** Welcher Aufenthalt zählt für die Anzeige: Anreise/Turn → der anreisende Gast, sonst der bleibende bzw. abreisende. */
const stayIdFor = (p: { cleaningType: string; stayId: string | null; arrivingStayId: string | null }) =>
  p.cleaningType === "ARRIVAL" || p.cleaningType === "SAME_DAY_TURN" ? p.arrivingStayId ?? p.stayId : p.stayId ?? p.arrivingStayId;

/**
 * Zeilen der Arbeitslisten für einen Tag (gemeinsame Quelle für Zimmermädchen- und Supervisor-Liste).
 * `depts` begrenzt die Traces auf Abteilungen (Housekeeper: nur HOUSEKEEPING).
 */
export async function loadRoomRows(date: string, where: { roomIds?: string[]; assignedToId?: string; floors?: number[] }, depts: string[] | null): Promise<RoomRow[]> {
  const [settings, typeCredits] = await Promise.all([getSettings(), getRoomTypeCredits()]);
  const rooms = await prisma.room.findMany({
    where: {
      ...(where.roomIds ? { id: { in: where.roomIds } } : {}),
      ...(where.assignedToId ? { assignedToId: where.assignedToId } : {}),
      ...(where.floors ? { floor: { in: where.floors } } : {}),
    },
    orderBy: { number: "asc" },
  });
  const ids = rooms.map((r) => r.id);
  const plans = await prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: ids } } });
  const planBy = new Map(plans.map((p) => [p.roomId, p]));
  const stayIds = plans.map((p) => stayIdFor(p)).filter((x): x is string => !!x);
  const stays = await prisma.stay.findMany({ where: { id: { in: stayIds } } });
  const stayBy = new Map(stays.map((s) => [s.id, s]));
  const traces = await prisma.trace.findMany({ where: { roomId: { in: ids }, date, ...(depts ? { dept: { in: depts } } : {}) }, orderBy: { createdAt: "asc" } });
  const traceBy = new Map<string, TraceView[]>();
  for (const t of traces) traceBy.set(t.roomId, [...(traceBy.get(t.roomId) ?? []), { id: t.id, code: t.code, text: t.text, dept: t.dept, status: t.status }]);
  const dnd = new Set((await prisma.guestRequest.findMany({ where: { kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] }, roomId: { in: ids } }, select: { roomId: true } })).map((g) => g.roomId));

  return rooms.map((r) => {
    const p = planBy.get(r.id);
    const stay = p ? stayBy.get(stayIdFor(p) ?? "") : undefined;
    const kind = (p?.cleaningType as Kind | undefined) ?? null;
    const factor = kind === "STAYOVER" ? creditFactor("STAYOVER", !!p?.laundryDue, settings) : 1;
    return {
      id: r.id, number: r.number, floor: r.floor, status: r.status, routeOrder: r.routeOrder, assignedToId: r.assignedToId, assignedOn: r.assignedOn,
      occupancy: r.occupancy, blockReason: r.blockReason, kind, laundry: !!p?.laundryDue, vip: !!(p?.vip || stay?.vip), eta: p?.eta ?? null,
      guest: stay ? shortGuestName(stay.guestName, stay.source) : null,
      pax: stay ? stay.adults + stay.children : null,
      dnd: dnd.has(r.id) || r.blockReason === "DND",
      credits: kind === "ARRIVAL" || !kind ? 0 : Math.round(((typeCredits[r.type as RoomType] ?? 1) * factor) * 100) / 100,
      traces: traceBy.get(r.id) ?? [],
    };
  });
}

export { timesInText };

export const isDone = (status: string) => status === "CLEAN" || status === "INSPECTED";
