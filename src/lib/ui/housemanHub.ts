/**
 * Hausmann-Hub im Design „Glas & Premium“ (Paket D5): reine Ableitungen für die Anzeige —
 * Hausmann-Liste (Traces, `/api/lists/houseman`) und von Hand angelegte Aufgaben (`/api/roomtasks`) zu einer Liste,
 * Filter, Kennzahlen. Kein React, keine DB, keine API. Abhaken bleibt `PATCH /api/traces/[id]` bzw. `/api/roomtasks/[id]`.
 */
import type { TKey } from "@/lib/i18n/translations";
import { berlinDate } from "@/lib/dayplan/time";
import type { PauseView } from "./engineeringHub";
import type { Tone } from "./tone";

export type HmKind = "trace" | "task";

export interface HmItemView {
  /** Eindeutig über beide Quellen (`trace:<id>` / `task:<id>`). */
  key: string;
  kind: HmKind;
  id: string;
  roomId: string | null;
  roomNumber: string;
  floor: number | null;
  /** Trace: Text aus Opera; Aufgabe: Freitext bei SONSTIGES. */
  text: string;
  /** Aufgabe: TWIN_SETUP | TWIN_REVERT | SONSTIGES. */
  taskType: string | null;
  status: "OPEN" | "DONE";
  times: string[];
  doneAt: string | null;
  createdAt: string | null;
  /** Gast nur als „Anrede Titel Nachname“ (kommt so vom Server, `shortGuestName`). */
  guest: string | null;
  requestedBy: string | null;
  waitsForDeparture: boolean;
  pause: PauseView | null;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const pauseOf = (v: unknown): PauseView | null => {
  if (!v) return null;
  const p = obj(v);
  return str(p.since) ? { reason: str(p.reason), since: p.since as string, byName: str(p.byName) } : null;
};

/** Zeile der Hausmann-Liste (Trace) → Ansicht; ohne Id/Zimmer → `null`. */
export function traceItem(raw: unknown): HmItemView | null {
  const r = obj(raw);
  const id = str(r.id);
  const roomNumber = str(r.roomNumber);
  if (!id || !roomNumber) return null;
  return {
    key: `trace:${id}`,
    kind: "trace",
    id,
    roomId: str(r.roomId),
    roomNumber,
    floor: typeof r.floor === "number" ? r.floor : null,
    text: str(r.text) ?? "",
    taskType: null,
    status: r.status === "DONE" ? "DONE" : "OPEN",
    times: Array.isArray(r.times) ? r.times.filter((x): x is string => typeof x === "string") : [],
    doneAt: str(r.doneAt),
    createdAt: null,
    guest: str(r.guest),
    requestedBy: null,
    waitsForDeparture: r.waitsForDeparture === true,
    pause: pauseOf(r.pause),
  };
}

/** Von Hand angelegte Aufgabe (`RoomTask`) → Ansicht; ohne Id/Zimmer → `null`. */
export function taskItem(raw: unknown): HmItemView | null {
  const r = obj(raw);
  const id = str(r.id);
  const room = obj(r.room);
  const roomNumber = str(room.number);
  if (!id || !roomNumber) return null;
  return {
    key: `task:${id}`,
    kind: "task",
    id,
    roomId: str(room.id),
    roomNumber,
    floor: typeof room.floor === "number" ? room.floor : null,
    text: str(r.note) ?? "",
    taskType: str(r.type),
    status: r.status === "DONE" ? "DONE" : "OPEN",
    times: [],
    doneAt: str(r.doneAt),
    createdAt: str(r.createdAt),
    guest: null,
    requestedBy: str(obj(r.createdBy).name),
    waitsForDeparture: false,
    pause: pauseOf(r.pause),
  };
}

/**
 * Eine Liste aus beiden Quellen: Aufgaben, die schon als Trace-Zeile erscheinen (`roomTaskId`), nicht doppelt;
 * von Hand angelegte erledigte Aufgaben nur, wenn sie heute (Berlin) erledigt wurden. Offene zuerst.
 */
export function mergeHousemanItems(traces: unknown[], tasks: unknown[], now: Date = new Date()): HmItemView[] {
  const linked = new Set(traces.map((t) => str(obj(t).roomTaskId)).filter((x): x is string => !!x));
  const today = berlinDate(now);
  const tr = traces.map(traceItem).filter((x): x is HmItemView => !!x);
  const tk = tasks
    .filter((t) => !linked.has(str(obj(t).id) ?? ""))
    .map(taskItem)
    .filter((x): x is HmItemView => !!x)
    .filter((t) => t.status === "OPEN" || (t.doneAt !== null && !Number.isNaN(new Date(t.doneAt).getTime()) && berlinDate(new Date(t.doneAt)) === today));
  const all = [...tr, ...tk];
  return [...all.filter((i) => i.status === "OPEN"), ...all.filter((i) => i.status === "DONE")];
}

export const HM_FILTERS = ["all", "open", "traces", "done"] as const;
export type HmFilter = (typeof HM_FILTERS)[number];
export const HM_FILTER_LABEL: Record<HmFilter, TKey> = {
  all: "hkHub.filterAll",
  open: "hkHub.kpiOpen",
  traces: "roleHub.traces",
  done: "hkHub.kpiDone",
};

export function matchesHmFilter(i: HmItemView, f: HmFilter, floor: number | null = null): boolean {
  if (floor !== null && i.floor !== floor) return false;
  if (f === "open") return i.status === "OPEN";
  if (f === "done") return i.status === "DONE";
  if (f === "traces") return i.kind === "trace";
  return true;
}

export function hmFilterCounts(items: HmItemView[], floor: number | null = null): { filter: HmFilter; count: number }[] {
  return HM_FILTERS.map((f) => ({ filter: f, count: items.filter((i) => matchesHmFilter(i, f, floor)).length })).filter((c) => c.filter === "all" || c.count > 0);
}

/** Kennzahlen: Aufgaben gesamt, erledigt, offen, offen „erst nach Abreise“. */
export function hmKpis(items: HmItemView[]) {
  const open = items.filter((i) => i.status === "OPEN");
  return { total: items.length, done: items.length - open.length, open: open.length, waits: open.filter((i) => i.waitsForDeparture).length };
}

/** Pille einer Zeile: erledigt (Erfolg) > Trace (Akzent) > Aufgabe (neutral). Text steht immer dabei. */
export function hmPill(i: Pick<HmItemView, "kind" | "status">): { labelKey: TKey; tone: Tone } {
  if (i.status === "DONE") return { labelKey: "hkHub.kpiDone", tone: "success" };
  return i.kind === "trace" ? { labelKey: "roleHub.trace", tone: "accent" } : { labelKey: "roleHub.task", tone: "neutral" };
}

/** Uhrzeit rechts in der Zeile: erste Zeit aus dem Trace-Text, sonst Erledigt-/Anlagezeit (formatiert vom Aufrufer). */
export function hmMetaTime(i: Pick<HmItemView, "times" | "status" | "doneAt" | "createdAt">): { kind: "text"; value: string } | { kind: "iso"; value: string } | null {
  if (i.status === "DONE" && i.doneAt) return { kind: "iso", value: i.doneAt };
  if (i.times.length > 0) return { kind: "text", value: i.times[0] };
  if (i.createdAt) return { kind: "iso", value: i.createdAt };
  return null;
}
