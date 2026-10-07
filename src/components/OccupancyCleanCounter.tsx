"use client";

import { computeOccupancyCleanCounts, type OccupancyCleanCountInput } from "@/lib/rooms/occupancyCleanCount";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * "N rooms occupied, M already cleaned" — one component, one query
 * (computeOccupancyCleanCounts), used by both the Duty Manager dashboard and
 * the Planungshub so the two screens can never show different numbers for
 * the same board.
 */
export default function OccupancyCleanCounter({
  rooms,
  className = "",
}: {
  rooms: OccupancyCleanCountInput[];
  className?: string;
}) {
  const { t } = useLocale();
  const { occupied, cleaned } = computeOccupancyCleanCounts(rooms);
  return (
    <div className={className}>
      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("common.occupancyCleanLabel")}</div>
      <div className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">{t("common.occupancyCleanValue", { occupied, cleaned })}</div>
    </div>
  );
}
