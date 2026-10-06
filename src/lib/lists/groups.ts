import { isDone } from "./dayRows";

export type RoomGroup = "PROGRESS" | "DONE" | "OPEN" | "DND" | "ARRIVAL";
export const GROUP_ORDER: RoomGroup[] = ["PROGRESS", "OPEN", "DND", "ARRIVAL", "DONE"];

/** Gruppe eines Zimmers in der Supervisor-Liste: in Arbeit, erledigt, offen, DND, Anreise ausstehend. */
export function groupOf(r: { status: string; dnd: boolean; kind: string | null }): RoomGroup {
  if (isDone(r.status)) return "DONE";
  if (r.status === "IN_PROGRESS") return "PROGRESS";
  if (r.dnd || r.status === "BLOCKED") return "DND";
  if (r.kind === "ARRIVAL") return "ARRIVAL";
  return "OPEN";
}
