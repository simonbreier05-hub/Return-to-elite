import { defaultRouteOrder } from "@/lib/assignment/routeOrder";

/**
 * Housekeeper-Hub „Meine Zimmer“ (vereint aus „Meine Liste“ + „Meine Zimmer“): Gruppierung nach Status, der eine
 * Ein-Tipp-Schritt je Zimmer und die Reihenfolge der empfohlenen Route — rein, ohne DB/React, damit Ansicht und Tests
 * dieselbe Regel lesen.
 */
export type HkGroup = "NOW" | "NEXT" | "DONE" | "OTHER";

/** Jetzt dran = begonnen (auch pausiert) oder Nacharbeit; Als Nächstes = noch offen; Fertig = gereinigt/freigegeben. */
export function hkGroupOf(status: string): HkGroup {
  switch (status) {
    case "IN_PROGRESS": case "PICKUP": return "NOW";
    case "DIRTY": case "BLOCKED": case "DEFECT_REPORTED": return "NEXT";
    case "CLEAN": case "INSPECTED": return "DONE";
    default: return "OTHER";
  }
}

export type HkAction = "START" | "FINISH" | "RESUME" | "UNBLOCK" | "DND" | null;

/**
 * Der eine große Knopf am Zimmer. Pausiert → Fortsetzen; Gast-DND blockiert nur den Start (ein Supervisor kann übersteuern,
 * siehe applyStatusChange). Nie INSPECTED — freigeben darf nur der Supervisor.
 */
export function primaryActionFor(status: string, opts: { guestDnd?: boolean; paused?: boolean } = {}): HkAction {
  if (opts.paused) return "RESUME";
  switch (status) {
    case "DIRTY": case "PICKUP": return opts.guestDnd ? "DND" : "START";
    case "BLOCKED": return opts.guestDnd ? "DND" : "UNBLOCK";
    case "IN_PROGRESS": return "FINISH";
    default: return null;
  }
}

/** Zielstatus des Knopfs (RESUME/DND ändern keinen Status). */
export const ACTION_TARGET: Partial<Record<Exclude<HkAction, null>, string>> = { START: "IN_PROGRESS", UNBLOCK: "IN_PROGRESS", FINISH: "CLEAN" };

/**
 * Empfohlene Route: eine gespeicherte Reihenfolge (`routeOrder`, aus dem Tagesplan oder per Ziehen) gewinnt; Zimmer ohne
 * Reihenfolge folgen dahinter nach Priorität, Etage, Abschnitt.
 */
export function orderRoute<T extends { id: string; number: string; floor: number; section?: string | null; routeOrder?: number | null }>(rooms: T[], score: (id: string) => number): T[] {
  const ordered = rooms.filter((r) => r.routeOrder != null).sort((a, b) => a.routeOrder! - b.routeOrder! || a.number.localeCompare(b.number));
  const rest = defaultRouteOrder(rooms.filter((r) => r.routeOrder == null).map((r) => ({ id: r.id, number: r.number, floor: r.floor, section: r.section ?? "", priorityScore: score(r.id) })));
  const byId = new Map(rooms.map((r) => [r.id, r]));
  return [...ordered, ...rest.map((r) => byId.get(r.id)!)];
}
