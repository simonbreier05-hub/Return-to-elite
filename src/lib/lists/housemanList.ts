import { prisma } from "@/lib/db";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import { listDay, type Kind } from "./dayRows";
import { shortGuestName, timesInText } from "./guestName";
import { activePauses, endPauseOnChange, type PauseView } from "@/lib/work/pauseData";
import { compareHousemanItems } from "@/lib/houseman/order";

export interface HousemanItem {
  id: string;
  roomId: string;
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
  /** Betrieb L2 (Punkt 9): Anreisezeit des Gastes „HH:MM“ (Tagesplan) — Sortierung nach Anreise, sonst Zimmernummer. */
  eta: string | null;
  /** Aktive Pause (Grund-Code, seit, von wem) — pausiert zählt nicht als erledigt. */
  pause: PauseView | null;
  /** F7 (H16): offen seit einem früheren Tag „YYYY-MM-DD“ (aufgeschoben / nicht erledigt) — steht oben mit Kennzeichen. */
  since: string | null;
}
export interface HousemanList { date: string | null; floors: number[]; items: HousemanItem[] }

/**
 * Hausmann-Liste: Traces der Abteilung Hausmann für den Tag (z. B. „Twinbett 207", „Twin zurück 208").
 * Erledigte bleiben erledigt (Trace.status bleibt beim Nachimport erhalten).
 */
export async function getHousemanList(floor?: number | null, forUserId?: string | null, onlyFloors?: number[] | null): Promise<HousemanList> {
  const date = await listDay();
  if (!date) return { date: null, floors: [], items: [] };
  const todays = await prisma.trace.findMany({ where: { date, dept: "HOUSEMAN" }, include: { room: { select: { id: true, number: true, floor: true } } }, orderBy: [{ createdAt: "asc" }] });
  // F7 (H16, entschieden): offene Hausmann-Aufgaben der letzten 7 Tage wandern mit — außer der Gast ist abgereist
  // (Aufenthalt ausgecheckt/storniert) oder dieselbe Aufgabe steht heute schon in der Liste (Nachimport).
  const weekAgo = new Date(Date.parse(`${date}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const older = await prisma.trace.findMany({ where: { dept: "HOUSEMAN", status: "OPEN", date: { lt: date, gte: weekAgo } }, include: { room: { select: { id: true, number: true, floor: true } } }, orderBy: [{ date: "asc" }] });
  // Abgereist: Aufenthalt ausgecheckt/storniert/schon gelöscht, oder der heutige Tagesplan des Zimmers kennt ihn nicht mehr
  const olderStayIds = older.map((t) => t.stayId).filter((x): x is string => !!x);
  const live = new Set((await prisma.stay.findMany({ where: { id: { in: olderStayIds }, status: { notIn: ["CHECKED_OUT", "CANCELLED"] } }, select: { id: true } })).map((s) => s.id));
  const todayStays = new Map<string, Set<string>>();
  for (const pl of await prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: older.map((t) => t.roomId) } }, select: { roomId: true, stayId: true, arrivingStayId: true } })) {
    todayStays.set(pl.roomId, new Set([pl.stayId, pl.arrivingStayId].filter((x): x is string => !!x)));
  }
  const gone = new Set(olderStayIds.filter((id) => !live.has(id)));
  for (const t of older) if (t.stayId && todayStays.has(t.roomId) && todayStays.get(t.roomId)!.size > 0 && !todayStays.get(t.roomId)!.has(t.stayId)) gone.add(t.stayId);
  // Gleiche Aufgabe = Zimmer + Opera-Code (der Text ist nach der Nachtlöschung leer)
  const sameKey = (t: { roomId: string; code: string }) => `${t.roomId}|${t.code}`;
  const seen = new Set(todays.map(sameKey));
  const carried = older.filter((t) => !(t.stayId && gone.has(t.stayId)) && !seen.has(sameKey(t)) && (seen.add(sameKey(t)), true));
  const traces = [...carried, ...todays];
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
  const pauses = await activePauses("TRACE", traces.filter((t) => t.status !== "DONE").map((t) => t.id));
  const items = traces.map((t): HousemanItem => {
    const p = planBy.get(t.roomId);
    const kind = (p?.cleaningType ?? null) as Kind | null;
    const stay = p ? stays.get(p.arrivingStayId ?? p.stayId ?? "") : undefined;
    const task = classifyTraceText(t.text);
    return {
      // nach der Nachtlöschung ist der Opera-Text leer — dann Code und Hinweis statt einer leeren Zeile
      id: t.id, roomId: t.room.id, roomNumber: t.room.number, floor: t.room.floor, text: t.text || `Opera ${t.code} (Text nachts gelöscht)`, times: timesInText(t.text),
      status: t.status === "DONE" ? "DONE" : "OPEN", doneAt: t.doneAt?.toISOString() ?? null, roomTaskId: t.roomTaskId, assignedToId: t.assignedToId, assignedToName: t.assignedToId ? people.get(t.assignedToId) ?? null : null, doneByName: doneBy.get(t.id) ?? null,
      guest: stay ? shortGuestName(stay.guestName, stay.source) : null,
      waitsForDeparture: task?.type === "TWIN_REVERT" && kind !== "DEPARTURE" && kind !== "SAME_DAY_TURN",
      pause: t.status === "DONE" ? null : pauses.get(t.id) ?? null,
      eta: p?.eta ?? null,
      since: t.date < date ? t.date : null,
    };
  }).sort(compareHousemanItems); // Betrieb L2 (Punkt 9): offen zuerst, nach Anreisezeit, sonst Zimmernummer
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
  if (status === "DONE") {
    await endPauseOnChange("TRACE", t.id, actor.userId, t.roomId, t.room.number);
    if (t.roomTaskId) await endPauseOnChange("ROOMTASK", t.roomTaskId, actor.userId, t.roomId, t.room.number);
  }
  return { trace, changed: true, roomTaskId: t.roomTaskId, roomNumber: t.room.number };
}
