/**
 * Status-Zuordnung des neuen Designs (docs/design/glass-spec.md, Abschnitt 7):
 * Status → Symbol, Ton, Text (i18n-Schlüssel). Reine Daten, kein React, keine DB.
 *
 * Bausteine (`StatusChip`, `StatusIcon`) zeigen immer Symbol UND Text bzw. aria-label —
 * Status nie nur über Farbe.
 */
import type { RoomStatus, RoomTaskStatus } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";
import type { IconName } from "./icons";
import type { Tone } from "./tone";

export const UI_STATUSES = ["open", "cleaning", "done", "paused", "dnd", "defect", "rework"] as const;
export type UiStatus = (typeof UI_STATUSES)[number];

export interface StatusUi {
  icon: IconName;
  tone: Tone;
  labelKey: TKey;
}

export const STATUS_UI: Record<UiStatus, StatusUi> = {
  open: { icon: "circle", tone: "neutral", labelKey: "ui.status.open" },
  cleaning: { icon: "refresh", tone: "accent", labelKey: "ui.status.cleaning" },
  done: { icon: "check", tone: "success", labelKey: "ui.status.done" },
  paused: { icon: "pause", tone: "warning", labelKey: "ui.status.paused" },
  dnd: { icon: "moon", tone: "danger", labelKey: "ui.status.dnd" },
  defect: { icon: "wrench", tone: "danger", labelKey: "ui.status.defect" },
  rework: { icon: "refresh", tone: "warning", labelKey: "ui.status.rework" },
};

/**
 * Jeder Zimmerstatus des Bestands (`ROOM_STATUSES`) → Design-Status.
 * Aus Sicht der Housekeeper-Liste: „Erledigt“ = fertig gereinigt (CLEAN wartet zwar noch auf
 * die Prüfung, ist für die Kraft aber erledigt), außer Betrieb = „Mangel“.
 * Die genaue Bedeutung (z. B. „Sauber · Prüfung offen“) zeigen die Seiten weiter über
 * `status.<STATUS>` — dieses Mapping bestimmt nur Symbol und Ton.
 */
export const ROOM_STATUS_UI: Record<RoomStatus, UiStatus> = {
  DIRTY: "open",
  IN_PROGRESS: "cleaning",
  CLEAN: "done",
  INSPECTED: "done",
  PICKUP: "rework",
  BLOCKED: "dnd",
  DEFECT_REPORTED: "defect",
  OUT_OF_ORDER: "defect",
  OUT_OF_SERVICE: "defect",
  GREEN_OPT_OUT: "done",
};

/** Hausmann-/Aufgaben-Status (`ROOM_TASK_STATUSES`). */
export const ROOM_TASK_STATUS_UI: Record<RoomTaskStatus, UiStatus> = {
  OPEN: "open",
  DONE: "done",
};

/**
 * Design-Status eines Zimmers. Eine laufende Pause (`WorkPause`) überdeckt den Zimmerstatus,
 * ändert ihn aber nie (siehe CLAUDE.md „Pausieren“) — darum ein eigener Schalter.
 */
export function uiStatusForRoom(status: RoomStatus, opts: { paused?: boolean } = {}): UiStatus {
  if (opts.paused && status !== "CLEAN" && status !== "INSPECTED") return "paused";
  return ROOM_STATUS_UI[status];
}
