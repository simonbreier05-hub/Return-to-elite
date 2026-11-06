/**
 * Gemeinsames Zimmer-Fenster im Design „Glas & Premium“ (Paket D7): reine Anzeige-Regeln für
 * `RoomDetailModal` / `LiveRoomModal` im Glas-Modus. Kein React, keine DB, keine API —
 * Fenster und Tests lesen dieselbe Regel. Status, Rechte und API-Wege bleiben unverändert.
 */
import type { RoomStatus } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";
import { shortGuestName } from "@/lib/lists/guestName";
import { hkRowStatus } from "./hkHub";
import type { IconName } from "./icons";
import type { UiStatus } from "./status";
import type { Tone } from "./tone";

/** Status-Anzeige im Kopf: Pause überdeckt (ändert nie den Status), Gast-DND/Sperre DND zeigt „DND“ an offenen Zimmern. */
export function roomWindowStatus(r: { status: RoomStatus; blockReason?: string | null; paused: boolean; guestDnd: boolean }): UiStatus {
  return hkRowStatus({ status: r.status, paused: r.paused, dnd: r.guestDnd || r.blockReason === "DND" });
}

export const ROOM_FLAGS = ["occupied", "checkout", "defect"] as const;
export type RoomFlag = (typeof ROOM_FLAGS)[number];

/** Kennzeichen im Kopf: immer Symbol + Text (nie nur Farbe). */
export const ROOM_FLAG_UI: Record<RoomFlag, { icon: IconName; tone: Tone; labelKey: TKey }> = {
  occupied: { icon: "user", tone: "info", labelKey: "roomFlags.occupied" },
  checkout: { icon: "log-out", tone: "accent", labelKey: "roomFlags.checkoutToday" },
  defect: { icon: "wrench", tone: "danger", labelKey: "ui.marker.defect" },
};

/** Kennzeichen in fester Reihenfolge; „Mangel“ nur, wenn der Status ihn nicht schon zeigt. */
export function roomWindowFlags(r: { occupancy?: string | null; isCheckoutToday: boolean; defects: number; shown: UiStatus }): RoomFlag[] {
  const out: RoomFlag[] = [];
  if (r.occupancy === "OCCUPIED") out.push("occupied");
  if (r.isCheckoutToday) out.push("checkout");
  if (r.defects > 0 && r.shown !== "defect") out.push("defect");
  return out;
}

/**
 * Gast im Fenster immer „Anrede Titel Nachname“ — nie Vornamen. Von Hand erfasste Anreisen können volle Namen tragen
 * (`/api/rooms` kürzt nur für Housekeeper), darum wird hier zusätzlich gekürzt; importierte Namen bleiben wie sie sind.
 */
export function windowGuestName(raw: string | null | undefined, source: "IMPORT" | "MANUAL" = "MANUAL"): string | null {
  return shortGuestName(raw, source);
}

/** Zuständige Kraft: „#3 Name“ (Tagesnummer) oder nur der Name; ohne Zuteilung `null` (Fenster zeigt „nicht zugeteilt“). */
export function assignedLabel(a: { name: string; dailyNumber?: number | null } | null | undefined): string | null {
  if (!a) return null;
  return a.dailyNumber ? `#${a.dailyNumber} ${a.name}` : a.name;
}

/** Symbol je Gastanfrage-Art (statt Emoji). */
export function guestRequestIcon(kind: string): IconName {
  return kind === "DND" ? "moon" : kind === "CLEAN_REQUEST" ? "refresh" : "message";
}

/**
 * Höchstens ein goldener Hauptknopf: eine eigene Hauptaktion (Housekeeper-Weg) gewinnt; sonst „Fortsetzen“ bei laufender
 * Pause. „Pausieren“ ist immer eine Nebenaktion. `null` = kein Hauptknopf (reine Ansicht).
 */
export function roomWindowPrimary(r: { hasOwnPrimary: boolean; paused: boolean }): "own" | "resume" | null {
  if (r.hasOwnPrimary) return "own";
  if (r.paused) return "resume";
  return null;
}

/** Status-Knöpfe im Bearbeiten-Bereich: Symbol des Ziel-Status (statt Farbpunkt). */
export function statusTargetIcon(status: RoomStatus): IconName {
  return { DIRTY: "circle", IN_PROGRESS: "refresh", CLEAN: "check", INSPECTED: "check", PICKUP: "refresh", BLOCKED: "moon", DEFECT_REPORTED: "wrench", OUT_OF_ORDER: "wrench", OUT_OF_SERVICE: "wrench", GREEN_OPT_OUT: "check" }[status] as IconName;
}
