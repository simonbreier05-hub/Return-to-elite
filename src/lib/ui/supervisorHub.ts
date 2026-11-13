/**
 * Anzeige-Regeln der Supervisor-Seiten im Design „Glas & Premium“ (D3): Übersicht (Kennzahlen, „Team heute“,
 * Zimmer je Person nach Gruppen) und Tagesplanung (Kachelzustand, Credits je Kraft, Überlast).
 * Rein und client-sicher: keine DB, keine API, kein React. Zählt nichts neu, was `computeDayNumbers` schon zählt —
 * hier stehen nur Status-Zähler des Live-Boards und Gruppierungen für die Darstellung.
 */
import type { TKey } from "@/lib/i18n/translations";
import type { RoomType } from "@/lib/domain";
import { dndBlockedSummary } from "@/lib/dayplan/glance";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import { roomDayCategory, type RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import type { IconName } from "./icons";
import { tileStateFor, type TileState } from "./room-tile";
import type { UiStatus } from "./status";

/** Was die Supervisor-Seiten von einem Board-Zimmer (`/api/rooms`) brauchen. */
export interface SupRoom {
  id: string;
  number: string;
  floor: number;
  status: string;
  type?: string;
  credit?: number | null;
  blockReason?: string | null;
  guestDndActive?: boolean;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  arrivals: unknown[];
  routeOrder?: number | null;
  assignedTo?: { id: string; name: string; dailyNumber?: number | null } | null;
  defects?: unknown[];
}

export interface SupAttendant {
  id: string;
  name: string;
  currentRoomId?: string | null;
  dailyNumber?: number | null;
}

/** „Nichts mehr zu tun“ für die Kraft — wie bisher im Roster (`HousekeeperRoster`). */
export const DONE_STATUSES = new Set(["CLEAN", "INSPECTED"]);
const BLOCKED_STATUSES = new Set(["BLOCKED", "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE"]);

/** DND = Gast-Wunsch offen ODER vom Personal gemeldet (BLOCKED + DND) — dieselbe Regel wie `dndBlockedSummary`. */
export function isDndRoom(r: Pick<SupRoom, "status" | "blockReason" | "guestDndActive">): boolean {
  return !!r.guestDndActive || (r.status === "BLOCKED" && r.blockReason === "DND");
}

export const SUP_KPIS = ["open", "inProgress", "dnd", "defects"] as const;
export type SupKpi = (typeof SUP_KPIS)[number];

export const SUP_KPI_UI: Record<SupKpi, { labelKey: TKey; icon: IconName }> = {
  open: { labelKey: "supHub.kpiOpen", icon: "circle" },
  inProgress: { labelKey: "supHub.kpiInProgress", icon: "refresh" },
  dnd: { labelKey: "supHub.kpiDnd", icon: "moon" },
  defects: { labelKey: "supHub.kpiDefects", icon: "wrench" },
};

/** Welcher Status-Filter des Live-Boards zu einer Kachel gehört (Antippen = Board gefiltert, wie bisher die Kacheln). */
export const SUP_KPI_STATUS: Record<SupKpi, string> = {
  open: "DIRTY",
  inProgress: "IN_PROGRESS",
  dnd: "BLOCKED",
  defects: "DEFECT_REPORTED",
};

/**
 * Kennzahlen der Übersicht aus den Board-Zimmern (bei Supervisoren schon auf die eigenen Etagen begrenzt):
 * offen = schmutzig/Nachbessern ohne DND, in Arbeit = IN_PROGRESS, DND wie `dndBlockedSummary`,
 * Mängel = Zimmer mit Mangel-Status oder offener Mängelmeldung (jedes Zimmer einmal).
 */
export function supervisorKpis(rooms: SupRoom[]): Record<SupKpi, number> {
  return {
    open: rooms.filter((r) => (r.status === "DIRTY" || r.status === "PICKUP") && !isDndRoom(r)).length,
    inProgress: rooms.filter((r) => r.status === "IN_PROGRESS").length,
    dnd: dndBlockedSummary(rooms).dnd.length,
    defects: rooms.filter((r) => r.status === "DEFECT_REPORTED" || r.status === "OUT_OF_ORDER" || (r.defects?.length ?? 0) > 0).length,
  };
}

/** Tageskategorie eines Board-Zimmers — immer über `roomDayCategory` (keine eigene Tageslogik). */
export function dayCategoryOf(r: Pick<SupRoom, "occupancy" | "isCheckoutToday" | "blockReason" | "arrivals">): RoomDayCategory {
  return roomDayCategory({ occupancy: r.occupancy ?? "VACANT", isCheckoutToday: r.isCheckoutToday, blockReason: r.blockReason, hasExpectedArrival: r.arrivals.length > 0 });
}

/** Zustand der Zimmerkachel; ein offener Gast-DND zeigt immer den Mond (auch wenn die Tageskategorie etwas anderes sagt). */
export function tileStateOf(r: Pick<SupRoom, "occupancy" | "isCheckoutToday" | "blockReason" | "arrivals" | "guestDndActive">, category = dayCategoryOf(r)): TileState {
  if (r.guestDndActive) return "dnd";
  return tileStateFor(category, r.occupancy === "OCCUPIED");
}

export const SUP_GROUPS = ["IN_PROGRESS", "OPEN", "DONE", "ARRIVAL", "DND", "BLOCKED"] as const;
export type SupGroup = (typeof SUP_GROUPS)[number];

export const SUP_GROUP_UI: Record<SupGroup, { labelKey: TKey; icon: IconName }> = {
  IN_PROGRESS: { labelKey: "supHub.groupInProgress", icon: "refresh" },
  OPEN: { labelKey: "supHub.groupOpen", icon: "circle" },
  DONE: { labelKey: "supHub.groupDone", icon: "check" },
  ARRIVAL: { labelKey: "supHub.groupArrival", icon: "log-in" },
  DND: { labelKey: "supHub.groupDnd", icon: "moon" },
  BLOCKED: { labelKey: "supHub.groupBlocked", icon: "wrench" },
};

/** Hauptgruppe eines Zimmers. DND geht vor allem anderen (Zimmer darf nicht betreten werden). */
export function groupOf(r: Pick<SupRoom, "status" | "blockReason" | "guestDndActive">): Exclude<SupGroup, "ARRIVAL"> {
  if (isDndRoom(r)) return "DND";
  if (r.status === "IN_PROGRESS") return "IN_PROGRESS";
  if (DONE_STATUSES.has(r.status)) return "DONE";
  if (BLOCKED_STATUSES.has(r.status)) return "BLOCKED";
  return "OPEN";
}

const byRoute = (a: SupRoom, b: SupRoom) =>
  (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity) || a.number.localeCompare(b.number, undefined, { numeric: true });

/** Zimmer einer Kraft in Laufplan-Reihenfolge. */
export function roomsOf(rooms: SupRoom[], attendantId: string): SupRoom[] {
  return rooms.filter((r) => r.assignedTo?.id === attendantId).sort(byRoute);
}

/**
 * Zimmer einer Kraft nach Gruppen (Figma `31:653`): In Arbeit, Offen, Erledigt, Anreise offen, DND, Gesperrt/Mangel.
 * „Anreise offen“ ist eine zusätzliche Sicht: Zimmer mit erwarteter Anreise, die noch nicht freigegeben sind —
 * sie stehen zusätzlich in ihrer Hauptgruppe. Leere Gruppen entfallen.
 */
export function roomGroups(rooms: SupRoom[], attendantId: string): { group: SupGroup; rooms: SupRoom[] }[] {
  const own = roomsOf(rooms, attendantId);
  const out: { group: SupGroup; rooms: SupRoom[] }[] = [];
  for (const g of SUP_GROUPS) {
    const list = g === "ARRIVAL" ? own.filter((r) => r.arrivals.length > 0 && r.status !== "INSPECTED") : own.filter((r) => groupOf(r) === g);
    if (list.length) out.push({ group: g, rooms: list });
  }
  return out;
}

/** „Ingrid Berger“ → „Ingrid B.“ (Figma). Einteilige Namen bleiben. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

export type RosterStatus = Extract<UiStatus, "open" | "cleaning" | "done">;

export interface RosterEntry {
  id: string;
  number: number;
  name: string;
  short: string;
  done: number;
  total: number;
  credits: number;
  status: RosterStatus;
}

/**
 * „Team heute“: eine Kachel je Kraft. Reihenfolge und Nummer wie bisher im Roster (alphabetisch, Tagesnummer sonst Position).
 * Status: in Reinigung (ein Zimmer IN_PROGRESS), erledigt (alle Zimmer fertig), sonst offen.
 */
export function rosterEntries(attendants: SupAttendant[], rooms: SupRoom[], creditOf: (roomId: string) => number): RosterEntry[] {
  const sorted = [...attendants].sort((a, b) => a.name.localeCompare(b.name));
  return sorted.map((a, i) => {
    const own = roomsOf(rooms, a.id);
    const done = own.filter((r) => DONE_STATUSES.has(r.status)).length;
    const cleaning = own.some((r) => r.status === "IN_PROGRESS");
    return {
      id: a.id,
      number: a.dailyNumber ?? i + 1,
      name: a.name,
      short: shortName(a.name),
      done,
      total: own.length,
      credits: roundCredits(own.reduce((n, r) => n + creditOf(r.id), 0)),
      status: cleaning ? "cleaning" : own.length > 0 && done === own.length ? "done" : "open",
    };
  });
}

export const roundCredits = (n: number) => Math.round(n * 10) / 10;

/** Einstellungen für die Credits je Zimmer — dieselben Felder, die der Grundriss liest (`/api/settings`). */
export interface CreditSettings {
  roomTypeCredits: Record<string, number>;
}

/**
 * Credit eines Zimmers — dieselbe Rechnung wie im Grundriss (`computeRoomCredit`, Wäschewechsel nur aus dem Tagesplan).
 * Ohne Einstellungen: 0 (die Kachel zeigt dann keine erfundene Zahl).
 */
export function roomCreditOf(r: Pick<SupRoom, "type" | "credit" | "occupancy" | "isCheckoutToday" | "blockReason" | "arrivals">, _laundryDue: boolean, s: CreditSettings | null): number {
  // Plan-1b: Credit = Zimmerkategorie; Art und Wäschewechsel ändern ihn nicht mehr.
  if (!s) return 0;
  return computeRoomCredit({ type: (r.type ?? "") as RoomType, credits: s.roomTypeCredits as Record<RoomType, number>, roomCredit: r.credit });
}

/** Überlast = über der Credit-Richtgröße (nur ein Hinweis, nie eine Sperre — wie bisher im Grundriss). */
export function isOverTarget(credits: number, target: number): boolean {
  return credits > target;
}

/** Ø Credits der Kräfte, die heute Zimmer haben (Kachel der Tagesplanung). Keine Kraft mit Zimmern → null. */
export function averageCredits(perAttendant: number[]): number | null {
  const withRooms = perAttendant.filter((c) => c > 0);
  if (!withRooms.length) return null;
  return roundCredits(withRooms.reduce((a, b) => a + b, 0) / withRooms.length);
}
