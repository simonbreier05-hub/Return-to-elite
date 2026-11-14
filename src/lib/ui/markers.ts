/**
 * Marker am Zimmer (docs/design/glass-spec.md, Abschnitt 7): Marker → Symbol, Ton, Text.
 * Reine Daten. `MarkerBadge` zeigt das Symbol, der Text ist das aria-label/der Tooltip.
 */
import type { TKey } from "@/lib/i18n/translations";
import type { IconName } from "./icons";
import type { Tone } from "./tone";

/** `later` = Planung L1 (Regel 9): Gastwunsch „Reinigung ab HH:MM“ — Text mit Uhrzeit (`ui.marker.later`, {{time}}). */
export const MARKERS = ["priority", "dnd", "defect", "laundry", "arrival", "vip", "pause", "later"] as const;
export type MarkerKind = (typeof MARKERS)[number];

export interface MarkerUi {
  icon: IconName;
  tone: Tone;
  labelKey: TKey;
}

export const MARKER_UI: Record<MarkerKind, MarkerUi> = {
  priority: { icon: "zap", tone: "warning", labelKey: "ui.marker.priority" },
  dnd: { icon: "moon", tone: "danger", labelKey: "ui.marker.dnd" },
  defect: { icon: "wrench", tone: "danger", labelKey: "ui.marker.defect" },
  laundry: { icon: "shirt", tone: "info", labelKey: "ui.marker.laundry" },
  arrival: { icon: "log-in", tone: "accent", labelKey: "ui.marker.arrival" },
  vip: { icon: "star", tone: "accent", labelKey: "ui.marker.vip" },
  pause: { icon: "pause", tone: "warning", labelKey: "ui.marker.pause" },
  later: { icon: "clock", tone: "info", labelKey: "ui.marker.later" },
};

/** RoomRow zeigt höchstens zwei Marker (Figma `21:144`), RoomRowCompact einen (`39:1948`). */
export const MAX_MARKERS_ROW = 2;
export const MAX_MARKERS_COMPACT = 1;
