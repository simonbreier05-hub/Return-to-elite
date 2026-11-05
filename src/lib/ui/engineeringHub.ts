/**
 * Techniker-Hub im Design „Glas & Premium“ (Paket D5): reine Ableitungen für die Anzeige —
 * Auftrag lesen (defensiv), Status → Pille, Herkunft (Gast/Housekeeping), Filter, Kennzahlen, nächster Schritt.
 * Kein React, keine DB, keine API. Statuswechsel und Rechte bleiben auf dem Server (`/api/workorders/[id]`).
 */
import type { TKey } from "@/lib/i18n/translations";
import { berlinDate } from "@/lib/dayplan/time";
import type { Tone } from "./tone";

export const WO_STATUSES = ["OPEN", "ACK", "IN_PROGRESS", "RESOLVED"] as const;
export type WoStatus = (typeof WO_STATUSES)[number];

export interface PauseView {
  reason: string | null;
  since: string;
  byName: string | null;
}

/** Ein Arbeitsauftrag, wie die Ansicht ihn braucht — jedes Feld hat einen sicheren Ersatz. */
export interface WorkOrderView {
  id: string;
  status: WoStatus;
  createdAt: string | null;
  resolvedAt: string | null;
  assignedName: string | null;
  pause: PauseView | null;
  category: string | null;
  note: string;
  photoPath: string | null;
  room: { id: string | null; number: string | null; openNotesCount: number };
  reporter: { name: string | null; role: string | null };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Liest einen Auftrag aus `/api/workorders` oder einem Live-Ereignis. Fehlt etwas (`reportedBy`, Zimmer, Mangel …),
 * bleibt die Ansicht stehen: Ersatzwerte statt Absturz. Ohne `id` ist es kein Auftrag (→ `null`).
 */
export function normalizeWorkOrder(raw: unknown): WorkOrderView | null {
  const r = obj(raw);
  const id = str(r.id);
  if (!id) return null;
  const d = obj(r.defect);
  const room = obj(d.room);
  const rep = obj(d.reportedBy);
  const p = r.pause ? obj(r.pause) : null;
  const status = (WO_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as WoStatus) : "OPEN";
  return {
    id,
    status,
    createdAt: str(r.createdAt),
    resolvedAt: str(r.resolvedAt),
    assignedName: str(obj(r.assignedTo).name),
    pause: p && str(p.since) ? { reason: str(p.reason), since: p.since as string, byName: str(p.byName) } : null,
    category: str(d.category),
    note: str(d.note) ?? "",
    photoPath: str(d.photoPath),
    room: { id: str(room.id), number: str(room.number), openNotesCount: num(room.openNotesCount) },
    reporter: { name: str(rep.name), role: str(rep.role) },
  };
}

/** Teil-Update (Socket/PATCH) in einen vorhandenen Auftrag mischen — fehlende Teile bleiben wie sie waren. */
export function mergeWorkOrder(prev: WorkOrderView, raw: unknown): WorkOrderView {
  const next = normalizeWorkOrder(raw);
  if (!next) return prev;
  const r = obj(raw);
  const hasDefect = r.defect && typeof r.defect === "object";
  return {
    ...prev,
    status: next.status,
    resolvedAt: "resolvedAt" in r ? next.resolvedAt : prev.resolvedAt,
    assignedName: "assignedTo" in r ? next.assignedName : prev.assignedName,
    pause: "pause" in r ? next.pause : prev.pause,
    createdAt: next.createdAt ?? prev.createdAt,
    ...(hasDefect
      ? {
          category: next.category ?? prev.category,
          note: next.note || prev.note,
          photoPath: next.photoPath ?? prev.photoPath,
          room: { ...prev.room, ...Object.fromEntries(Object.entries(next.room).filter(([, v]) => v !== null && v !== 0)) },
          reporter: next.reporter.name || next.reporter.role ? next.reporter : prev.reporter,
        }
      : {}),
  };
}

/** Wer hat gemeldet? Gast (Gast-Bildschirm), Housekeeping (Zimmermädchen/Supervisor) oder sonst jemand. */
export type EngSource = "guest" | "housekeeping" | "other";
export function sourceOf(v: Pick<WorkOrderView, "reporter">): EngSource {
  if (v.reporter.role === "guest") return "guest";
  if (v.reporter.role === "room_attendant" || v.reporter.role === "supervisor") return "housekeeping";
  return "other";
}

/** Nächster Schritt (gleiche Reihenfolge wie bisher): Bestätigen → Arbeit beginnen → Erledigt. */
export const NEXT_STEP: Record<WoStatus, { to: WoStatus; labelKey: TKey; icon: "check" | "play" } | null> = {
  OPEN: { to: "ACK", labelKey: "engineering.acknowledge", icon: "check" },
  ACK: { to: "IN_PROGRESS", labelKey: "engineering.startWork", icon: "play" },
  IN_PROGRESS: { to: "RESOLVED", labelKey: "engineering.markResolved", icon: "check" },
  RESOLVED: null,
};

/** „Erledigt“ fragt vorher nach (Figma `36:2364`); die anderen Schritte nicht. */
export const needsConfirm = (to: WoStatus) => to === "RESOLVED";

/** Status-Pille: Text aus `workOrderStatus.*`, Ton nach Spezifikation Abschnitt 7 (nie nur Farbe — Text steht immer dabei). */
export const STATUS_PILL: Record<WoStatus, { labelKey: TKey; tone: Tone }> = {
  OPEN: { labelKey: "workOrderStatus.OPEN", tone: "warning" },
  ACK: { labelKey: "workOrderStatus.ACK", tone: "info" },
  IN_PROGRESS: { labelKey: "workOrderStatus.IN_PROGRESS", tone: "accent" },
  RESOLVED: { labelKey: "workOrderStatus.RESOLVED", tone: "success" },
};

export const ENG_FILTERS = ["all", "guest", "housekeeping", "done"] as const;
export type EngFilter = (typeof ENG_FILTERS)[number];
export const ENG_FILTER_LABEL: Record<EngFilter, TKey> = {
  all: "hkHub.filterAll",
  guest: "engineering.sourceGuest",
  housekeeping: "department.housekeeping",
  done: "hkHub.kpiDone",
};

export function matchesEngFilter(v: WorkOrderView, f: EngFilter): boolean {
  if (f === "all") return true;
  if (f === "done") return v.status === "RESOLVED";
  return v.status !== "RESOLVED" && sourceOf(v) === f;
}

/** „Alle“ immer, die anderen nur mit Treffern. */
export function engFilterCounts(views: WorkOrderView[]): { filter: EngFilter; count: number }[] {
  return ENG_FILTERS.map((f) => ({ filter: f, count: views.filter((v) => matchesEngFilter(v, f)).length })).filter((c) => c.filter === "all" || c.count > 0);
}

/** Offene zuerst (in API-Reihenfolge = neueste zuerst), erledigte ans Ende. */
export function sortWorkOrders(views: WorkOrderView[]): WorkOrderView[] {
  return [...views.filter((v) => v.status !== "RESOLVED"), ...views.filter((v) => v.status === "RESOLVED")];
}

/** Kennzahlen: Offen (neu + bestätigt), In Arbeit, Erledigt heute (Berliner Tag), offene Gast-Meldungen. */
export function engKpis(views: WorkOrderView[], now: Date = new Date()) {
  const today = berlinDate(now);
  const active = views.filter((v) => v.status !== "RESOLVED");
  return {
    open: views.filter((v) => v.status === "OPEN" || v.status === "ACK").length,
    inProgress: views.filter((v) => v.status === "IN_PROGRESS").length,
    doneToday: views.filter((v) => {
      if (v.status !== "RESOLVED" || !v.resolvedAt) return false;
      const d = new Date(v.resolvedAt);
      return !Number.isNaN(d.getTime()) && berlinDate(d) === today;
    }).length,
    guestOpen: active.filter((v) => sourceOf(v) === "guest").length,
  };
}
