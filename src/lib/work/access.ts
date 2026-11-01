import type { PauseTarget } from "@/lib/domain";

/**
 * Wer darf an einer Aufgabe arbeiten (pausieren/fortsetzen) und wer sieht Nachrichten an ein Zimmer — reine Regeln, ohne DB,
 * damit Tests und alle Routen dieselbe Antwort geben. Rollenrechte wie überall: Housekeeper nur eigene Zimmer, Supervisor nur
 * eigene Etagen (ohne zugeteilte Etagen: ganzes Haus, wie das Live-Board — `resolveFloorScope`), Duty Manager alles.
 */

export interface Viewer {
  role: string;
  userId: string;
  /** Etagen eines Supervisors; null = keine Einschränkung (Duty Manager, Supervisor ohne Etagen). */
  floors: number[] | null;
}

export interface WorkTarget {
  type: PauseTarget;
  floor: number;
  /** Zuständige Person (Zimmer: heutige Zuteilung; Aufgabe/Auftrag: zugeteilt; null = für alle der Abteilung). */
  assigneeId: string | null;
  /** Erledigt (Zimmer CLEAN/INSPECTED, Aufgabe DONE, Auftrag RESOLVED) — erledigte Arbeit kann nicht pausiert werden. */
  done: boolean;
  /** Nur Zimmer: begonnen (IN_PROGRESS) — nur begonnene Zimmer lassen sich pausieren. */
  started?: boolean;
  /** Nur Trace: Abteilung (nur HOUSEMAN-Traces sind Hausmann-Aufgaben). */
  dept?: string;
}

const onFloor = (v: Viewer, floor: number) => !v.floors || v.floors.includes(floor);

/** Darf diese Person an der Aufgabe arbeiten (unabhängig vom Zustand)? */
export function canWorkOn(v: Viewer, t: WorkTarget): boolean {
  if (v.role === "duty_manager") return true;
  if (v.role === "supervisor") return onFloor(v, t.floor);
  const mineOrOpen = !t.assigneeId || t.assigneeId === v.userId;
  switch (t.type) {
    case "ROOM": return v.role === "room_attendant" && t.assigneeId === v.userId;
    case "ROOMTASK": return v.role === "houseman" && mineOrOpen;
    case "TRACE": return v.role === "houseman" && t.dept === "HOUSEMAN" && mineOrOpen;
    case "WORKORDER": return v.role === "engineering" && mineOrOpen;
  }
}

export type PauseCheck = { ok: true } | { ok: false; status: 403 | 409; error: string; code?: string };

/**
 * Pausieren: nur nicht erledigte Arbeit, Zimmer nur wenn begonnen, und nicht doppelt.
 * Fortsetzen: jederzeit, solange eine aktive Pause besteht.
 */
export function checkPause(v: Viewer, t: WorkTarget, action: "pause" | "resume", active: boolean): PauseCheck {
  if (!canWorkOn(v, t)) return { ok: false, status: 403, error: "Keine Berechtigung für diese Aufgabe.", code: "NO_PERMISSION" };
  if (action === "resume") return active ? { ok: true } : { ok: false, status: 409, error: "Die Aufgabe ist nicht pausiert.", code: "NOT_PAUSED" };
  if (active) return { ok: false, status: 409, error: "Die Aufgabe ist schon pausiert.", code: "ALREADY_PAUSED" };
  if (t.done) return { ok: false, status: 409, error: "Erledigte Aufgaben können nicht pausiert werden.", code: "PAUSE_DONE_TASK" };
  if (t.type === "ROOM" && !t.started) return { ok: false, status: 409, error: "Nur ein begonnenes Zimmer kann pausiert werden.", code: "PAUSE_ONLY_STARTED" };
  return { ok: true };
}

export interface RoomInvolvement {
  floor: number;
  /** Heute zugeteiltes Zimmermädchen. */
  housekeeperId: string | null;
  /** Hausmänner mit einer (offenen oder für alle sichtbaren) Aufgabe in diesem Zimmer; "*" = alle Hausmänner. */
  housemanIds: string[];
  /** Techniker mit einem Arbeitsauftrag in diesem Zimmer; "*" = alle Techniker (Auftrag nicht zugeteilt). */
  engineerIds: string[];
}

const hit = (ids: string[], userId: string) => ids.includes("*") || ids.includes(userId);

/** Nachrichten an Zimmer/Aufgabe sehen (und schreiben) nur Beteiligte. */
export function canSeeMessages(v: Viewer, r: RoomInvolvement): boolean {
  switch (v.role) {
    case "duty_manager": return true;
    case "supervisor": return onFloor(v, r.floor);
    case "room_attendant": return r.housekeeperId === v.userId;
    case "houseman": return hit(r.housemanIds, v.userId);
    case "engineering": return hit(r.engineerIds, v.userId);
    default: return false;
  }
}

/**
 * Sieht diese Person die Nachrichten nur, weil ihr (noch) keine Etagen zugewiesen sind? Dann gilt sie wie auf dem Live-Board
 * fürs ganze Haus, die Nachrichten werden aber als „außerhalb der Zuständigkeit“ gekennzeichnet (und sie wird nicht gemeldet).
 */
export function messagesOutOfScope(v: Viewer, r: RoomInvolvement): boolean {
  return v.role === "supervisor" && !v.floors && canSeeMessages(v, r);
}

/**
 * Wer bekommt eine Meldung bei einer neuen Nachricht: das zuständige Zimmermädchen, die Supervisoren der Etage, beteiligte
 * Hausmänner/Techniker. Der Autor nie. Der Duty Manager sieht ohnehin alle Meldungen; eine eigene bekommt er nur, wenn sonst
 * niemand zuständig ist (sonst stünde dieselbe Nachricht doppelt in seiner Liste).
 */
export function messageRecipients(input: {
  authorId: string;
  involvement: RoomInvolvement;
  supervisors: { id: string; floors: number[] }[];
  housemen: string[];
  engineers: string[];
  dutyManagers: string[];
}): { userId: string; role: string }[] {
  const { authorId, involvement: r } = input;
  const out = new Map<string, string>();
  const add = (id: string | null, role: string) => { if (id && id !== authorId && !out.has(id)) out.set(id, role); };
  add(r.housekeeperId, "room_attendant");
  for (const s of input.supervisors) if (s.floors.includes(r.floor)) add(s.id, "supervisor");
  for (const h of r.housemanIds.includes("*") ? input.housemen : r.housemanIds) add(h, "houseman");
  for (const e of r.engineerIds.includes("*") ? input.engineers : r.engineerIds) add(e, "engineering");
  if (out.size === 0) for (const d of input.dutyManagers) add(d, "duty_manager");
  return [...out].map(([userId, role]) => ({ userId, role }));
}
