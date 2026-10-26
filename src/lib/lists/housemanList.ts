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
  /** Dem Hausmann zugeteilt (null = für alle). */
  assignedToId: string | null;
  assignedToName: string | null;
  /** Wer die Aufgabe abgehakt hat (aus dem Logbuch) — nur bei erledigten. */
  doneByName: string | null;
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
export async function getHousemanList(floor?: number | null, forUserId?: string | null, onlyFloors?: number[] | null): Promise<HousemanList> {
  const date = await listDay();
  if (!date) return { date: null, floors: [], items: [] };
  const traces = await prisma.trace.findMany({ where: { date, dept: "HOUSEMAN" }, include: { room: { select: { id: true, number: true, floor: true } } }, orderBy: [{ createdAt: "asc" }] });
  const roomIds = traces.map((t) => t.roomId);
  const plans = await prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: roomIds } } });
  const planBy = new Map(plans.map((p) => [p.roomId, p]));
  const stayIds = plans.map((p) => p.arrivingStayId ?? p.stayId).filter((x): x is string => !!x);
  const stays = new Map((await prisma.stay.findMany({ where: { id: { in: stayIds } } })).map((s) => [s.id, s]));

  const people = new Map((await prisma.user.findMany({ where: { role: { in: ["houseman", "supervisor", "duty_manager"] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const doneIds = new Set(traces.filter((t) => t.status === "DONE").map((t) => t.id));
  const doneBy = new Map<string, string>();
  if (doneIds.size) {
    const logs = await prisma.auditLog.findMany({ where: { action: "TRACE_DONE", userId: { not: null } }, orderBy: { createdAt: "asc" }, take: 2000, select: { userId: true, meta: true } });
    for (const l of logs) { try { const id = (JSON.parse(l.meta ?? "{}") as { traceId?: string }).traceId; if (id && doneIds.has(id)) doneBy.set(id, people.get(l.userId!) ?? "—"); } catch { /* ignorieren */ } }
  }
  const items = traces.map((t): HousemanItem => {
    const p = planBy.get(t.roomId);
    const kind = (p?.cleaningType ?? null) as Kind | null;
    const stay = p ? stays.get(p.arrivingStayId ?? p.stayId ?? "") : undefined;
    const task = classifyTraceText(t.text);
    return {
      id: t.id, roomNumber: t.room.number, floor: t.room.floor, text: t.text, times: timesInText(t.text),
      status: t.status === "DONE" ? "DONE" : "OPEN", doneAt: t.doneAt?.toISOString() ?? null, roomTaskId: t.roomTaskId, assignedToId: t.assignedToId, assignedToName: t.assignedToId ? people.get(t.assignedToId) ?? null : null, doneByName: doneBy.get(t.id) ?? null,
      guest: stay ? shortGuestName(stay.guestName, stay.source) : null,
      waitsForDeparture: task?.type === "TWIN_REVERT" && kind !== "DEPARTURE" && kind !== "SAME_DAY_TURN",
    };
  }).sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || a.roomNumber.localeCompare(b.roomNumber));
  // Ein Hausmann sieht seine eigenen und die nicht zugeteilten Aufgaben; Supervisor sehen alle.
  let visible = forUserId ? items.filter((i) => !i.assignedToId || i.assignedToId === forUserId) : items;
  // Supervisor sehen nur Aufgaben auf ihren Etagen; der Duty Manager sieht alle (onlyFloors = null).
  if (onlyFloors) visible = visible.filter((i) => onlyFloors.includes(i.floor));
  const floors = [...new Set(visible.map((i) => i.floor))].sort((a, b) => a - b);
  return { date, floors, items: floor ? visible.filter((i) => i.floor === floor) : visible };
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
