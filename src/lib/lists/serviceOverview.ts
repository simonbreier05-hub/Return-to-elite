import { prisma } from "@/lib/db";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import { isDone, listDay, loadRoomRows, type Kind, type RoomRow } from "./dayRows";
import { floorsFor } from "./supervisorList";
import { isToClean, type DayKind } from "@/lib/dayplan/dayNumbers";

/** Welcher Service ein Zimmer heute braucht — eine Definition für alle Ansichten. */
export type ServiceKey = "TURN" | "DEPARTURE" | "STAYOVER_LINEN" | "STAYOVER" | "ARRIVAL";
export const SERVICE_ORDER: ServiceKey[] = ["TURN", "DEPARTURE", "STAYOVER_LINEN", "STAYOVER", "ARRIVAL"];

export function serviceOf(kind: Kind, laundry: boolean): ServiceKey {
  if (kind === "SAME_DAY_TURN") return "TURN";
  if (kind === "DEPARTURE") return "DEPARTURE";
  if (kind === "ARRIVAL") return "ARRIVAL";
  return laundry ? "STAYOVER_LINEN" : "STAYOVER";
}
const DAY_KIND: Record<ServiceKey, DayKind> = { TURN: "TURN", DEPARTURE: "DEPARTURE", STAYOVER_LINEN: "STAYOVER", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL" };
/**
 * Wird das Zimmer heute gereinigt? Dieselbe Regel wie die Tageszahlen (`isToClean`): Abreise, Turn und Bleiber immer,
 * eine Anreise nur in ein noch nicht gereinigtes Zimmer. Ohne Status (nur Art bekannt) gilt die Anreise als bereit.
 */
export const needsCleaning = (s: ServiceKey, status = "INSPECTED") => isToClean(DAY_KIND[s], status);

export interface ServiceExtra { dept: string; label: string; done: boolean }
export interface ServiceRoom {
  id: string; number: string; floor: number; type: string;
  service: ServiceKey; vip: boolean; eta: string | null; allergy: boolean; dnd: boolean;
  credits: number; status: string; done: boolean; assignedToName: string | null; extras: ServiceExtra[];
  /** Aktive Pause (Grund, seit, von wem). */
  pause: RoomRow["pause"];
}
export interface ServiceOverview {
  date: string | null;
  floors: number[];
  rooms: ServiceRoom[];
  counts: Record<ServiceKey, number> & { clean: number; special: number };
}

const EXTRA_LABEL: Record<string, string> = { TWIN_SETUP: "Twin-Aufbau", TWIN_REVERT: "Twin zurück", SONSTIGES: "Zusatzbett/Sonstiges" };
const short = (t: string) => (t.length > 60 ? `${t.slice(0, 57)}…` : t);

/**
 * „Welche Zimmer sind heute zu reinigen, und welches braucht welchen Service?“ — eine Übersicht aus dem Tagesplan (DayRoomPlan):
 * Art (Turn/Abreise/Bleiber/Bleiber + Wäsche/Anreise), VIP, Anreisezeit, Allergiker, DND, Sonderleistungen (Traces: Twin, Zusatzbett …),
 * Credits und die zugeteilte Kraft. Supervisor sehen nur ihre Etagen, der Duty Manager alle. Keine Gastnamen.
 * Hausmann-Aufgaben (Traces der Abteilung HOUSEMAN) stehen hier nicht — sie erscheinen ausschließlich in der Hausmann-Liste.
 */
export async function getServiceOverview(session: { userId: string; role: string }): Promise<ServiceOverview> {
  const floors = await floorsFor(session);
  const date = await listDay();
  const empty = { clean: 0, special: 0, TURN: 0, DEPARTURE: 0, STAYOVER_LINEN: 0, STAYOVER: 0, ARRIVAL: 0 };
  if (!date || !floors.length) return { date, floors, rooms: [], counts: empty };
  const rows = (await loadRoomRows(date, { floors }, null)).filter((r) => r.kind !== null);
  const flags = new Map((await prisma.room.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, type: true, isAntiAllergic: true } })).map((r) => [r.id, r]));
  const hk = new Map((await prisma.user.findMany({ where: { role: "room_attendant" }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const rooms = rows.map((r): ServiceRoom => {
    const f = flags.get(r.id);
    const extras = r.traces.filter((t) => t.dept !== "HOUSEMAN").map((t): ServiceExtra => {
      const task = classifyTraceText(t.text);
      return { dept: t.dept, label: task ? (task.type === "SONSTIGES" && task.note ? task.note : EXTRA_LABEL[task.type] ?? short(t.text)) : short(t.text), done: t.status === "DONE" };
    });
    return {
      id: r.id, number: r.number, floor: r.floor, type: f?.type ?? "STANDARD", service: serviceOf(r.kind!, r.laundry), vip: r.vip, eta: r.eta,
      allergy: !!f?.isAntiAllergic, dnd: r.dnd, credits: r.credits, status: r.status, done: isDone(r.status),
      assignedToName: r.assignedToId && r.assignedOn === date ? hk.get(r.assignedToId) ?? null : null, extras, pause: r.pause,
    };
  }).sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number));

  const counts = { ...empty };
  for (const r of rooms) {
    counts[r.service]++;
    if (needsCleaning(r.service, r.status)) counts.clean++;
    if (r.vip || r.allergy || r.extras.length) counts.special++;
  }
  return { date, floors, rooms, counts };
}
