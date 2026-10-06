import { prisma } from "@/lib/db";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import { listDay, type Kind } from "./dayRows";
import { shortGuestName, timesInText } from "./guestName";

export interface HousemanItem {
  id: string;
  roomNumber: string;
  floor: number;
  text: string;
  /** Uhrzeiten aus dem Trace-Text, falls vorhanden. */
  times: string[];
  status: "OPEN" | "DONE";
  doneAt: string | null;
  roomTaskId: string | null;
  /** „Herr Dr. Krüger" — nie Vornamen. */
  guest: string | null;
  /** Rückbau (Twin zurück) ist erst nach der Abreise dran. */
  waitsForDeparture: boolean;
}
export interface HousemanList { date: string | null; floors: number[]; items: HousemanItem[] }

/**
 * Hausmann-Liste: Traces der Abteilung Hausmann für den Tag (z. B. „Twinbett 207", „Twin zurück 208").
 * Erledigte bleiben erledigt (Trace.status bleibt beim Nachimport erhalten).
 */
export async function getHousemanList(floor?: number | null): Promise<HousemanList> {
  const date = await listDay();
  if (!date) return { date: null, floors: [], items: [] };
  const traces = await prisma.trace.findMany({ where: { date, dept: "HOUSEMAN" }, include: { room: { select: { id: true, number: true, floor: true } } }, orderBy: [{ createdAt: "asc" }] });
  const roomIds = traces.map((t) => t.roomId);
  const plans = await prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: roomIds } } });
  const planBy = new Map(plans.map((p) => [p.roomId, p]));
  const stayIds = plans.map((p) => p.arrivingStayId ?? p.stayId).filter((x): x is string => !!x);
  const stays = new Map((await prisma.stay.findMany({ where: { id: { in: stayIds } } })).map((s) => [s.id, s]));

  const items = traces.map((t): HousemanItem => {
    const p = planBy.get(t.roomId);
    const kind = (p?.cleaningType ?? null) as Kind | null;
    const stay = p ? stays.get(p.arrivingStayId ?? p.stayId ?? "") : undefined;
    const task = classifyTraceText(t.text);
    return {
      id: t.id, roomNumber: t.room.number, floor: t.room.floor, text: t.text, times: timesInText(t.text),
      status: t.status === "DONE" ? "DONE" : "OPEN", doneAt: t.doneAt?.toISOString() ?? null, roomTaskId: t.roomTaskId,
      guest: stay ? shortGuestName(stay.guestName, stay.source) : null,
      waitsForDeparture: task?.type === "TWIN_REVERT" && kind !== "DEPARTURE" && kind !== "SAME_DAY_TURN",
    };
  }).sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || a.roomNumber.localeCompare(b.roomNumber));
  const floors = [...new Set(items.map((i) => i.floor))].sort((a, b) => a - b);
  return { date, floors, items: floor ? items.filter((i) => i.floor === floor) : items };
}

/** Hakt einen Hausmann-Trace ab bzw. öffnet ihn wieder und zieht die verknüpfte Aufgabe (RoomTask) mit. Gibt null zurück, wenn der Trace nicht zur Abteilung Hausmann gehört. */
export async function setHousemanTraceStatus(traceId: string, status: "OPEN" | "DONE", actor: { userId: string; role: string }) {
  const t = await prisma.trace.findUnique({ where: { id: traceId }, include: { room: { select: { number: true } } } });
  if (!t || t.dept !== "HOUSEMAN") return null;
  if (t.status === status) return { trace: t, changed: false, roomTaskId: t.roomTaskId, roomNumber: t.room.number };
  const trace = await prisma.trace.update({ where: { id: t.id }, data: { status, doneAt: status === "DONE" ? new Date() : null } });
  if (t.roomTaskId) {
    await prisma.roomTask.update({
      where: { id: t.roomTaskId },
      data: status === "DONE"
        ? { status: "DONE", doneAt: new Date(), ...(actor.role === "houseman" ? { assignedToId: actor.userId } : {}) }
        : { status: "OPEN", doneAt: null },
    }).catch(() => null);
  }
  return { trace, changed: true, roomTaskId: t.roomTaskId, roomNumber: t.room.number };
}
