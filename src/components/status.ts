import type { RoomStatus } from "@/lib/domain";

/**
 * Tailwind classes per status, using the house's muted status palette
 * (see the --color-status-* tokens in globals.css) rather than stock
 * Tailwind reds/blues/yellows — kept deliberately deep/desaturated so
 * status colour never competes with the navy/brass brand palette, while
 * staying clearly distinct status-to-status for a supervisor scanning the
 * board at a glance.
 */
export const STATUS_STYLES: Record<RoomStatus, { chip: string; tile: string; dot: string }> = {
  DIRTY: {
    chip: "bg-status-dirty/10 text-status-dirty border-status-dirty/30",
    tile: "bg-status-dirty text-linen border-black/20",
    dot: "bg-status-dirty",
  },
  IN_PROGRESS: {
    chip: "bg-status-in-progress/10 text-status-in-progress border-status-in-progress/30",
    tile: "bg-status-in-progress text-linen border-black/20",
    dot: "bg-status-in-progress",
  },
  CLEAN: {
    chip: "bg-status-clean/10 text-status-clean border-status-clean/30",
    tile: "bg-status-clean text-linen border-black/20",
    dot: "bg-status-clean",
  },
  INSPECTED: {
    chip: "bg-status-inspected/10 text-status-inspected border-status-inspected/30",
    tile: "bg-status-inspected text-linen border-black/20",
    dot: "bg-status-inspected",
  },
  PICKUP: {
    chip: "bg-status-pickup/10 text-status-pickup border-status-pickup/30",
    tile: "bg-status-pickup text-linen border-black/20",
    dot: "bg-status-pickup",
  },
  BLOCKED: {
    chip: "bg-status-blocked/10 text-status-blocked border-status-blocked/30",
    tile: "bg-status-blocked text-linen border-black/20",
    dot: "bg-status-blocked",
  },
  DEFECT_REPORTED: {
    chip: "bg-status-defect/10 text-status-defect border-status-defect/30",
    tile: "bg-status-defect text-linen border-black/20",
    dot: "bg-status-defect",
  },
  OUT_OF_ORDER: {
    chip: "bg-status-out-of-order/10 text-status-out-of-order border-status-out-of-order/30",
    tile: "bg-status-out-of-order text-linen border-black/20",
    dot: "bg-status-out-of-order",
  },
  OUT_OF_SERVICE: {
    chip: "bg-status-out-of-service/10 text-status-out-of-service border-status-out-of-service/30",
    tile: "bg-status-out-of-service text-linen border-black/20",
    dot: "bg-status-out-of-service",
  },
  GREEN_OPT_OUT: {
    chip: "bg-status-green-opt-out/10 text-status-green-opt-out border-status-green-opt-out/30",
    tile: "bg-status-green-opt-out text-linen border-black/20",
    dot: "bg-status-green-opt-out",
  },
};
