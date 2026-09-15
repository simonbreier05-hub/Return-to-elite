"use client";

import { noteBadgeVariant } from "./status";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Small open/done note-count indicator. Originally local to the supervisor
 * board tile and its drawer; pulled out here so every screen that renders a
 * room card — supervisor tile, RoomDrawer, RoomDetailModal, the global quick
 * search — shows the exact same badge for "notes exist" instead of each
 * screen approximating its own.
 */
export default function NoteCountBadge({
  openCount,
  totalCount,
  className = "",
}: {
  openCount: number;
  totalCount: number;
  className?: string;
}) {
  const { t } = useLocale();
  const variant = noteBadgeVariant(openCount, totalCount);
  if (!variant) return null;
  return variant === "open" ? (
    <span
      className={`flex h-4 min-w-4 items-center justify-center rounded-full border border-gold-line bg-gold px-1 text-[9px] font-bold text-white ${className}`}
      title={t("roomFlags.notesOpen", { count: openCount })}
    >
      {openCount}
    </span>
  ) : (
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 bg-gray-100 text-[9px] text-gray-600 ${className}`}
      title={t("roomFlags.notesAllDone")}
    >
      ✓
    </span>
  );
}
