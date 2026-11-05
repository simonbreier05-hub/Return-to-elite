/**
 * Concierge-Hub im Design „Glas & Premium“ (Paket D5): reine Ableitungen für die Anzeige —
 * Ausflug lesen (defensiv), Zustand aus den vorhandenen Zeiten (geplant / Gast außer Haus / kommt bald zurück /
 * zurück), Filter, Kennzahlen. Ein Ausflug hat in der Datenbank keinen eigenen Status — hier wird nichts erfunden.
 * Kein React, keine DB, keine API. Anlegen bleibt `POST /api/excursions`.
 */
import type { TKey } from "@/lib/i18n/translations";
import { shortGuestName } from "@/lib/lists/guestName";
import type { Tone } from "./tone";

export interface ExcursionView {
  id: string;
  guest: string | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  room: { id: string | null; number: string | null; openNotesCount: number };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

export function normalizeExcursion(raw: unknown): ExcursionView | null {
  const r = obj(raw);
  const id = str(r.id);
  if (!id) return null;
  const room = obj(r.room);
  return {
    id,
    guest: shortGuestName(str(r.guestName)),
    startsAt: str(r.startsAt),
    endsAt: str(r.endsAt),
    note: str(r.note),
    room: { id: str(room.id), number: str(room.number), openNotesCount: typeof room.openNotesCount === "number" ? room.openNotesCount : 0 },
  };
}

/** „Kommt bald zurück“ = Fenster endet in höchstens einer Stunde (gleiche Regel wie die bisherige Leiste). */
export const ENDING_SOON_MS = 60 * 60_000;

export type ExcursionPhase = "planned" | "out" | "endingSoon" | "back";

export function phaseOf(e: Pick<ExcursionView, "startsAt" | "endsAt">, now: number = Date.now()): ExcursionPhase {
  const s = ms(e.startsAt);
  const end = ms(e.endsAt);
  if (!Number.isNaN(end) && end <= now) return "back";
  if (!Number.isNaN(s) && s > now) return "planned";
  if (!Number.isNaN(end) && end - now <= ENDING_SOON_MS) return "endingSoon";
  return Number.isNaN(s) ? "planned" : "out";
}

export const PHASE_PILL: Record<ExcursionPhase, { labelKey: TKey; tone: Tone }> = {
  planned: { labelKey: "roleHub.planned", tone: "neutral" },
  out: { labelKey: "roleHub.guestOut", tone: "info" },
  endingSoon: { labelKey: "roleHub.endingSoon", tone: "warning" },
  back: { labelKey: "roleHub.back", tone: "success" },
};

export const CC_FILTERS = ["all", "out", "planned", "back"] as const;
export type CcFilter = (typeof CC_FILTERS)[number];
export const CC_FILTER_LABEL: Record<CcFilter, TKey> = {
  all: "hkHub.filterAll",
  out: "roleHub.guestOut",
  planned: "roleHub.planned",
  back: "roleHub.back",
};

export function matchesCcFilter(e: ExcursionView, f: CcFilter, now: number = Date.now()): boolean {
  if (f === "all") return true;
  const p = phaseOf(e, now);
  return f === "out" ? p === "out" || p === "endingSoon" : p === f;
}

export function ccFilterCounts(list: ExcursionView[], now: number = Date.now()): { filter: CcFilter; count: number }[] {
  return CC_FILTERS.map((f) => ({ filter: f, count: list.filter((e) => matchesCcFilter(e, f, now)).length })).filter((c) => c.filter === "all" || c.count > 0);
}

/** Kennzahlen: Ausflüge gesamt, Gast gerade außer Haus, kommt bald zurück, noch geplant. */
export function ccKpis(list: ExcursionView[], now: number = Date.now()) {
  const phases = list.map((e) => phaseOf(e, now));
  return {
    total: list.length,
    out: phases.filter((p) => p === "out" || p === "endingSoon").length,
    endingSoon: phases.filter((p) => p === "endingSoon").length,
    planned: phases.filter((p) => p === "planned").length,
  };
}

/** Offene Fenster zuerst (nach Beginn), zurückgekehrte ans Ende. */
export function sortExcursions(list: ExcursionView[], now: number = Date.now()): ExcursionView[] {
  const byStart = (a: ExcursionView, b: ExcursionView) => (ms(a.startsAt) || 0) - (ms(b.startsAt) || 0);
  return [...list.filter((e) => phaseOf(e, now) !== "back").sort(byStart), ...list.filter((e) => phaseOf(e, now) === "back").sort(byStart)];
}
