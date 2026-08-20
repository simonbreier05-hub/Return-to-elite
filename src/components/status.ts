import type { RoomStatus } from "@/lib/domain";

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
export const STATUS_STYLES: Record<RoomStatus, { chip: string; tile: string; dot: string; iconKey: "warning" | "clock" | "ban" | "check" }> = {
  DIRTY: {
    chip: "bg-status-dirty/10 text-status-dirty border-status-dirty/30",
    tile: "bg-status-dirty text-linen border-black/20",
    dot: "bg-status-dirty",
    iconKey: "warning",
  },
  IN_PROGRESS: {
    chip: "bg-status-in-progress/10 text-status-in-progress border-status-in-progress/30",
    tile: "bg-status-in-progress text-linen border-black/20",
    dot: "bg-status-in-progress",
    iconKey: "clock",
  },
  CLEAN: {
    chip: "bg-status-clean/10 text-status-clean border-status-clean/30",
    tile: "bg-status-clean text-linen border-black/20",
    dot: "bg-status-clean",
    iconKey: "clock",
  },
  INSPECTED: {
    chip: "bg-status-inspected/10 text-status-inspected border-status-inspected/30",
    tile: "bg-status-inspected text-linen border-black/20",
    dot: "bg-status-inspected",
    iconKey: "check",
  },
  PICKUP: {
    chip: "bg-status-pickup/10 text-status-pickup border-status-pickup/30",
    tile: "bg-status-pickup text-linen border-black/20",
    dot: "bg-status-pickup",
    iconKey: "warning",
  },
  BLOCKED: {
    chip: "bg-status-blocked/10 text-status-blocked border-status-blocked/30",
    tile: "bg-status-blocked text-linen border-black/20",
    dot: "bg-status-blocked",
    iconKey: "ban",
  },
  DEFECT_REPORTED: {
    chip: "bg-status-defect/10 text-status-defect border-status-defect/30",
    tile: "bg-status-defect text-linen border-black/20",
    dot: "bg-status-defect",
    iconKey: "warning",
  },
  OUT_OF_ORDER: {
    chip: "bg-status-out-of-order/10 text-status-out-of-order border-status-out-of-order/30",
    tile: "bg-status-out-of-order text-linen border-black/20",
    dot: "bg-status-out-of-order",
    iconKey: "ban",
  },
  OUT_OF_SERVICE: {
    chip: "bg-status-out-of-service/10 text-status-out-of-service border-status-out-of-service/30",
    tile: "bg-status-out-of-service text-linen border-black/20",
    dot: "bg-status-out-of-service",
    iconKey: "ban",
  },
  GREEN_OPT_OUT: {
    chip: "bg-status-green-opt-out/10 text-status-green-opt-out border-status-green-opt-out/30",
    tile: "bg-status-green-opt-out text-linen border-black/20",
    dot: "bg-status-green-opt-out",
    iconKey: "check",
  },
};
