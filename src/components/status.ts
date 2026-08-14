import type { RoomStatus } from "@/lib/domain";

/** Tailwind classes per status — board color scheme from the spec. */
export const STATUS_STYLES: Record<RoomStatus, { chip: string; tile: string; dot: string }> = {
  DIRTY: {
    chip: "bg-red-100 text-red-800 border-red-300",
    tile: "bg-red-500/90 text-white border-red-700",
    dot: "bg-red-500",
  },
  IN_PROGRESS: {
    chip: "bg-blue-100 text-blue-800 border-blue-300",
    tile: "bg-blue-500/90 text-white border-blue-700",
    dot: "bg-blue-500",
  },
  CLEAN: {
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    tile: "bg-yellow-400 text-charcoal border-yellow-600",
    dot: "bg-yellow-400",
  },
  INSPECTED: {
    chip: "bg-emerald-100 text-emerald-800 border-emerald-300",
    tile: "bg-emerald-500/90 text-white border-emerald-700",
    dot: "bg-emerald-500",
  },
  PICKUP: {
    chip: "bg-orange-100 text-orange-800 border-orange-300",
    tile: "bg-orange-500/90 text-white border-orange-700",
    dot: "bg-orange-500",
  },
  BLOCKED: {
    chip: "bg-purple-100 text-purple-800 border-purple-300",
    tile: "bg-purple-500/90 text-white border-purple-700",
    dot: "bg-purple-500",
  },
  DEFECT_REPORTED: {
    chip: "bg-amber-100 text-amber-900 border-amber-300",
    tile: "bg-amber-600/90 text-white border-amber-800",
    dot: "bg-amber-600",
  },
  OUT_OF_ORDER: {
    chip: "bg-gray-200 text-gray-700 border-gray-400",
    tile: "bg-gray-400 text-white border-gray-600",
    dot: "bg-gray-400",
  },
  OUT_OF_SERVICE: {
    chip: "bg-gray-200 text-gray-600 border-gray-300",
    tile: "bg-gray-300 text-gray-700 border-gray-500",
    dot: "bg-gray-300",
  },
  GREEN_OPT_OUT: {
    chip: "bg-teal-100 text-teal-800 border-teal-300",
    tile: "bg-teal-500/90 text-white border-teal-700",
    dot: "bg-teal-500",
  },
};
