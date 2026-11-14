/**
 * Front-Office-Hub im Design „Glas & Premium“ (Paket D5): reine Ableitungen für die Anzeige —
 * Anreise lesen (defensiv), Gast als „Anrede Titel Nachname“, Kennzeichen → Pille, Filter, Kennzahlen.
 * Kein React, keine DB, keine API. Ändern bleibt `PATCH /api/arrivals/[id]` (ETA, VIP, Früh, Sofort, Check-in).
 */
import type { RoomStatus } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";
import { shortGuestName } from "@/lib/lists/guestName";
import type { Tone } from "./tone";

const ROOM_STATUSES: RoomStatus[] = ["DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "PICKUP", "BLOCKED", "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT"];

export interface ArrivalView {
  id: string;
  /** Nur „Anrede Titel Nachname“ (nie Vorname/Alter), `null` wenn leer. */
  guest: string | null;
  eta: string | null;
  vip: boolean;
  earlyCheckIn: boolean;
  neededNow: boolean;
  status: "EXPECTED" | "CHECKED_IN";
  room: { id: string | null; number: string | null; status: RoomStatus | null; openNotesCount: number };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Anreise aus `/api/arrivals` oder Live-Ereignis; ohne Id oder storniert → `null`. */
export function normalizeArrival(raw: unknown): ArrivalView | null {
  const r = obj(raw);
  const id = str(r.id);
  if (!id || r.status === "CANCELLED") return null;
  const room = obj(r.room);
  const rs = str(room.status) as RoomStatus | null;
  return {
    id,
    guest: shortGuestName(str(r.guestName), str(r.source) ?? "MANUAL"),
    eta: str(r.eta),
    vip: r.vip === true,
    earlyCheckIn: r.earlyCheckIn === true,
    neededNow: r.neededNow === true,
    status: r.status === "CHECKED_IN" ? "CHECKED_IN" : "EXPECTED",
    room: {
      id: str(room.id),
      number: str(room.number),
      status: rs && ROOM_STATUSES.includes(rs) ? rs : null,
      openNotesCount: typeof room.openNotesCount === "number" ? room.openNotesCount : 0,
    },
  };
}

/** Zimmer freigegeben (nur INSPECTED — Front Office checkt nur dann ein, wie bisher). */
export const isReady = (a: Pick<ArrivalView, "room">) => a.room.status === "INSPECTED";

/** ETA vorbei und Zimmer noch nicht frei (gleiche Regel wie die bisherige Dringend-Leiste). */
export function isOverdue(a: ArrivalView, now: number = Date.now()): boolean {
  if (a.status !== "EXPECTED" || !a.eta || isReady(a)) return false;
  const t = new Date(a.eta).getTime();
  return !Number.isNaN(t) && t < now;
}

export const FO_FILTERS = ["all", "early", "vip", "notReady", "checkedIn"] as const;
export type FoFilter = (typeof FO_FILTERS)[number];
export const FO_FILTER_LABEL: Record<FoFilter, TKey> = {
  all: "hkHub.filterAll",
  early: "frontOffice.early",
  vip: "frontOffice.vip",
  notReady: "roleHub.notReady",
  checkedIn: "frontOffice.checkedIn",
};

export function matchesFoFilter(a: ArrivalView, f: FoFilter): boolean {
  switch (f) {
    case "early":
      return a.status === "EXPECTED" && (a.earlyCheckIn || a.neededNow);
    case "vip":
      return a.vip;
    case "notReady":
      return a.status === "EXPECTED" && !isReady(a);
    case "checkedIn":
      return a.status === "CHECKED_IN";
    default:
      return true;
  }
}

export function foFilterCounts(list: ArrivalView[]): { filter: FoFilter; count: number }[] {
  return FO_FILTERS.map((f) => ({ filter: f, count: list.filter((a) => matchesFoFilter(a, f)).length })).filter((c) => c.filter === "all" || c.count > 0);
}

/** Erwartete zuerst (nach ETA, ohne ETA ans Ende), eingecheckte danach. */
export function sortArrivals(list: ArrivalView[]): ArrivalView[] {
  const time = (a: ArrivalView) => {
    const t = a.eta ? new Date(a.eta).getTime() : NaN;
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };
  const exp = list.filter((a) => a.status === "EXPECTED").sort((a, b) => time(a) - time(b));
  return [...exp, ...list.filter((a) => a.status === "CHECKED_IN")];
}

/** Kennzahlen: erwartete Anreisen, früh/sofort, VIP, davon freigegeben. */
export function foKpis(list: ArrivalView[]) {
  const exp = list.filter((a) => a.status === "EXPECTED");
  return {
    expected: exp.length,
    early: exp.filter((a) => a.earlyCheckIn || a.neededNow).length,
    vip: exp.filter((a) => a.vip).length,
    ready: exp.filter(isReady).length,
  };
}

/** Eine Pille je Zeile (wichtigste zuerst): eingecheckt > sofort nötig > früh > VIP. Text steht immer dabei. */
export function foPill(a: ArrivalView): { labelKey: TKey; tone: Tone } | null {
  if (a.status === "CHECKED_IN") return { labelKey: "frontOffice.checkedIn", tone: "success" };
  if (a.neededNow) return { labelKey: "frontOffice.neededNow", tone: "danger" };
  if (a.earlyCheckIn) return { labelKey: "frontOffice.early", tone: "accent" };
  if (a.vip) return { labelKey: "frontOffice.vip", tone: "accent" };
  return null;
}

/**
 * Betrieb L2 (Punkt 5): Front Office sieht live, wo das Zimmer steht — offen → in Arbeit → geprüft (gereinigt, Abnahme
 * durch den Supervisor läuft) → freigegeben. Nur Ableitung aus `Room.status` (Live über `room:update`), keine eigene Zählung.
 */
export const FO_STAGES = ["OPEN", "IN_PROGRESS", "CHECK", "RELEASED"] as const;
export type FoStage = (typeof FO_STAGES)[number];

export function foStage(status: RoomStatus | null | undefined): FoStage {
  switch (status) {
    case "IN_PROGRESS": case "PICKUP": return "IN_PROGRESS"; // Nacharbeit = wieder in Arbeit
    case "CLEAN": return "CHECK";
    case "INSPECTED": return "RELEASED";
    default: return "OPEN";
  }
}

export const FO_STAGE_LABEL: Record<FoStage, TKey> = {
  OPEN: "frontOffice.stageOPEN",
  IN_PROGRESS: "frontOffice.stageIN_PROGRESS",
  CHECK: "frontOffice.stageCHECK",
  RELEASED: "frontOffice.stageRELEASED",
};
