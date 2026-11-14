import type { Tone } from "@/lib/ui/tone";
import type { UiStatus } from "@/lib/ui/status";
import type { MarkerKind } from "@/lib/ui/markers";
import { cx, RowDivider } from "./primitives";

/** Zustände aller Zeilen (Figma: Default / Selected / Done). */
export type RowState = "default" | "selected" | "done";

export interface PillData {
  label: string;
  tone?: Tone;
  /** Zweite Farbe als Rand (z. B. Turn Blau/Rot). */
  edge?: Tone;
}
export interface StatusData {
  value: UiStatus;
  label: string;
}
export interface MarkerData {
  kind: MarkerKind;
  label: string;
}

/** Hülle einer Zeile: Mindesthöhe 80, Radius 15; ausgewählt = Glas + Auswahlmarkierung, sonst Trennlinie. */
export function rowClasses(state: RowState, extra?: string) {
  return cx(
    "relative flex w-full min-h-(--size-row-height) items-center rounded-(--glass-radius-sm) px-4 py-3",
    state === "selected" && "glass glass-selected",
    state === "done" && "opacity-65",
    extra,
  );
}

export function RowDecor({ state, compact }: { state: RowState; compact?: boolean }) {
  if (state === "selected") return <span aria-hidden="true" className={cx("selection-marker", compact && "selection-marker-compact")} />;
  return <RowDivider />;
}
