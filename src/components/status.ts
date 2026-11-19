import type { NoteStatus, RoomStatus } from "@/lib/domain";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";

/**
 * Tailwind classes per status, using the house's muted status palette
 * (see the --color-status-* tokens in globals.css) rather than stock
 * Tailwind reds/blues/yellows — kept deliberately deep/desaturated so
 * status colour never competes with the navy/brass brand palette, while
 * staying clearly distinct status-to-status for a supervisor scanning the
 * board at a glance.
 *
 * `iconKey` names one of the app's four status glyphs (see
 * components/icons.tsx's StatusIcon) so colour is never the only signal —
 * every status chip pairs its colour with an icon and the text label,
 * which also keeps it legible for colour-blind users.
 */
export const STATUS_STYLES: Record<
  RoomStatus,
  { chip: string; tile: string; dot: string; border: string; iconKey: "warning" | "clock" | "ban" | "check" }
> = {
  DIRTY: {
    chip: "bg-status-danger-bg text-status-danger-fg border-status-danger-fg/40",
    tile: "bg-status-dirty text-linen border-black/20",
    dot: "bg-status-dirty",
    border: "border-s-status-dirty",
    iconKey: "warning",
  },
  IN_PROGRESS: {
    chip: "bg-status-info-bg text-status-info-fg border-status-info-fg/40",
    tile: "bg-status-in-progress text-linen border-black/20",
    dot: "bg-status-in-progress",
    border: "border-s-status-in-progress",
    iconKey: "clock",
  },
  CLEAN: {
    chip: "bg-status-warning-bg text-status-warning-fg border-status-warning-fg/40",
    tile: "bg-status-clean text-linen border-black/20",
    dot: "bg-status-clean",
    border: "border-s-status-clean",
    iconKey: "clock",
  },
  INSPECTED: {
    chip: "bg-status-success-bg text-status-success-fg border-status-success-fg/40",
    tile: "bg-status-inspected text-linen border-black/20",
    dot: "bg-status-inspected",
    border: "border-s-status-inspected",
    iconKey: "check",
  },
  PICKUP: {
    chip: "bg-status-warning-bg text-status-warning-fg border-status-warning-fg/40",
    tile: "bg-status-pickup text-linen border-black/20",
    dot: "bg-status-pickup",
    border: "border-s-status-pickup",
    iconKey: "warning",
  },
  BLOCKED: {
    chip: "bg-status-danger-bg text-status-danger-fg border-status-danger-fg/40",
    tile: "bg-status-blocked text-linen border-black/20",
    dot: "bg-status-blocked",
    border: "border-s-status-blocked",
    iconKey: "ban",
  },
  DEFECT_REPORTED: {
    chip: "bg-status-danger-bg text-status-danger-fg border-status-danger-fg/40",
    tile: "bg-status-defect text-linen border-black/20",
    dot: "bg-status-defect",
    border: "border-s-status-defect",
    iconKey: "warning",
  },
  OUT_OF_ORDER: {
    chip: "bg-status-danger-bg text-status-danger-fg border-status-danger-fg/40",
    tile: "bg-status-out-of-order text-linen border-black/20",
    dot: "bg-status-out-of-order",
    border: "border-s-status-out-of-order",
    iconKey: "ban",
  },
  OUT_OF_SERVICE: {
    chip: "bg-pill-neutral-bg text-text-secondary border-pill-neutral-border",
    tile: "bg-status-out-of-service text-linen border-black/20",
    dot: "bg-status-out-of-service",
    border: "border-s-status-out-of-service",
    iconKey: "ban",
  },
  GREEN_OPT_OUT: {
    chip: "bg-status-success-bg text-status-success-fg border-status-success-fg/40",
    tile: "bg-status-green-opt-out text-linen border-black/20",
    dot: "bg-status-green-opt-out",
    border: "border-s-status-green-opt-out",
    iconKey: "check",
  },
};

/**
 * A note's own OPEN/DONE state — a deliberately separate, small color system
 * from STATUS_STYLES above. Open = the house brass accent; done = neutral
 * gray, same tone already used for "removed from rotation" room states.
 */
export const NOTE_STATUS_STYLES: Record<NoteStatus, { badge: string }> = {
  OPEN: { badge: "bg-accent-subtle-bg text-accent-text border-border-accent" },
  DONE: { badge: "bg-surface-card-raised text-text-muted border-border-subtle" },
};

/**
 * Floor-plan day-status overlay (v4 Aufgabe D) — Anreise/Abreise/Bleiber/
 * Same-Day-Turn/DND, one colour per category, distinguishable at a glance
 * and never colour-alone (every chip pairs its colour with a short label).
 * DND reuses STATUS_STYLES.BLOCKED's exact palette so "blocked/DND" always
 * reads the same purple everywhere in the app, as v3 established; Departure
 * and Stayover reuse the parchment/white shading the morning-planning view
 * already uses for the same distinction (see planning/view.tsx's legend).
 */
// Simon-Feedback 19.11.2026: im Glas-Design — dieselben Töne wie die Pillen (CATEGORY_PILL_TONE, src/lib/ui/pill-tone.ts)
export const DAY_CATEGORY_STYLES: Record<RoomDayCategory, { chip: string; dot: string; label: string }> = {
  ARRIVAL: { chip: "bg-status-info-bg border-status-info-fg/40 text-status-info-fg", dot: "bg-status-info-fg", label: "Arrival" },
  DEPARTURE: { chip: "bg-status-danger-bg border-status-danger-fg/40 text-status-danger-fg", dot: "bg-status-danger-fg", label: "Departure" },
  STAYOVER: { chip: "bg-status-success-bg border-status-success-fg/40 text-status-success-fg", dot: "bg-status-success-fg", label: "Stayover" },
  SAME_DAY_TURN: { chip: "bg-pill-gold-bg border-pill-gold-border text-text-primary", dot: "bg-accent-text", label: "Same-day turn" },
  DND: { chip: STATUS_STYLES.BLOCKED.chip, dot: STATUS_STYLES.BLOCKED.dot, label: "DND" },
  NONE: { chip: "bg-surface-card-raised border-border-subtle text-text-muted", dot: "bg-text-muted", label: "—" },
};

/** Which badge variant a room's note-count indicator should render, if any. */
export function noteBadgeVariant(openCount: number, totalCount: number): "open" | "done" | null {
  if (totalCount === 0) return null;
  return openCount > 0 ? "open" : "done";
}
