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
      className={`flex h-4 min-w-4 items-center justify-center rounded-full border border-border-accent bg-champagne px-1 text-[9px] font-bold text-text-on-accent ${className}`}
      title={t("roomFlags.notesOpen", { count: openCount })}
    >
      {openCount}
    </span>
  ) : (
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full border border-border-subtle bg-surface-card-raised text-[9px] text-text-muted ${className}`}
      title={t("roomFlags.notesAllDone")}
    >
      ✓
    </span>
  );
}
