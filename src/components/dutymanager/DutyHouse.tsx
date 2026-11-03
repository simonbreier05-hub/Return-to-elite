"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";
import type { GlanceKpis } from "@/lib/dayplan/glance";
import type { GlanceKey } from "@/components/TodayAtAGlance";
import { floorProgress, occupancyPercent } from "@/lib/ui/dutyHouse";
import type { TKey } from "@/lib/i18n/translations";
import type { IconName } from "@/lib/ui/icons";
import { Banner, GlassCard, KpiTile, KpiTileCompact, Pill, ProgressBar, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";
import { useBreakpoint } from "@/components/shell/useBreakpoint";

export interface DutyHouseProps {
  numbers: DayNumbers | null;
  kpis: GlanceKpis;
  /** Board-Zimmer (nur Etage + Status werden gebraucht) — für den Etagenfortschritt. */
  rooms: { floor: number; status: string }[];
  /** Etagen ohne Supervisor (bestehende Zusatzkachel). */
  unassignedFloors: number;
  /** Planstatus laut `/api/import/status` (`plan`); `null` = nicht geladen, dann steht keine Aussage da. */
  plan: { confirmed: boolean; listsChanged: boolean } | null;
  open: (key: GlanceKey) => void;
  /** Hinweise ganz oben (Tagesplan fehlt, Fehler). */
  notices?: ReactNode;
}

interface Tile { key: GlanceKey; label: string; value: string | number; icon: IconName; attention?: boolean }

/**
 * Duty Manager „Haus“ im Design „Glas & Premium“ (Figma `34:1139`, Handy `41:2493`): Belegung, Kennzahlen, Tagesplan-Zahlen,
 * Fortschritt je Etage, Planstatus. Reine Darstellung — alle Zahlen kommen fertig von `app/duty-manager/view.tsx`
 * (gleiche Quellen wie vorher); jede Kachel öffnet dieselbe Detailansicht wie bisher.
 */
export function DutyHouse({ numbers, kpis, rooms, unassignedFloors, plan, open, notices }: DutyHouseProps) {
  const { t, fmt } = useLocale();
  const bp = useBreakpoint() ?? "tablet";
  const phone = bp === "phone";

  const pct = numbers ? occupancyPercent(numbers.occupied, numbers.inventory) : 0;
  const floors = floorProgress(rooms);

  const tile = (x: Tile) =>
    phone ? (
      <KpiTileCompact key={x.key} label={x.label} value={x.value} icon={x.icon} tone={x.attention ? "attention" : "default"} onClick={() => open(x.key)} />
    ) : (
      <KpiTile key={x.key} label={x.label} value={x.value} icon={x.icon} tone={x.attention ? "attention" : "default"} onClick={() => open(x.key)} />
    );

  const main: Tile[] = [
    { key: "arrivals", label: t("dutyManager.arrivalsToday"), value: kpis.arrivals, icon: "log-in" },
    { key: "departures", label: t("dutyManager.departuresToday"), value: kpis.departures, icon: "log-out" },
    { key: "dnd", label: t("dutyManager.dndRooms"), value: kpis.dnd, icon: "moon", attention: kpis.dnd > 0 },
    { key: "openDefects", label: t("dutyManager.openDefects"), value: kpis.openDefects, icon: "wrench", attention: kpis.openDefects > 0 },
  ];

  const day: Tile[] = numbers
    ? [
        { key: "toClean", label: t("dayNumbers.toClean"), value: numbers.toClean, icon: "bed-single" },
        { key: "assigned", label: t("dayNumbers.assigned"), value: t("dayNumbers.xOfN", { x: numbers.assigned, n: numbers.toClean }), icon: "users", attention: numbers.open > 0 },
        { key: "cleaned", label: t("dayNumbers.cleaned"), value: t("dayNumbers.xOfN", { x: numbers.cleaned, n: numbers.toClean }), icon: "check" },
        { key: "open", label: t("dayNumbers.open"), value: numbers.open, icon: "circle", attention: numbers.open > 0 },
        ...(numbers.laundryDue ? [{ key: "laundry" as const, label: t("dayNumbers.laundry"), value: numbers.laundryDue.count, icon: "shirt" as const }] : []),
        ...(numbers.arrivalChecks.total > 0
          ? [{ key: "arrivalChecks" as const, label: t("dayNumbers.arrivalChecks"), value: t("dayNumbers.xOfN", { x: numbers.arrivalChecks.released, n: numbers.arrivalChecks.total }), icon: "log-in" as const, attention: numbers.arrivalChecks.released < numbers.arrivalChecks.total }]
          : []),
      ]
    : [];

  const more: Tile[] = [
    { key: "openHouseTasks", label: t("dutyManager.openHouseTasks"), value: kpis.openHouseTasks, icon: "list", attention: kpis.openHouseTasks > 0 },
    { key: "extra", label: t("dutyManager.unassignedFloorsKpi"), value: unassignedFloors, icon: "triangle-alert", attention: unassignedFloors > 0 },
  ];

  const grid = cx("grid gap-3 sm:gap-4", phone ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4");

  const planStatus = plan && (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-label text-text-muted">{t("dmHub.planTitle")}</span>
      <Pill tone={plan.confirmed ? "success" : "warning"}>{plan.confirmed ? t("dmHub.planConfirmed") : t("dmHub.planOpen")}</Pill>
      {plan.listsChanged && <Pill tone="info">{t("planungTool.planChanged")}</Pill>}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {notices}

      <GlassCard as="section" aria-labelledby="dm-occ-title" className="flex flex-col gap-5">
        <div className={cx("flex gap-4", phone ? "flex-col" : "items-end justify-between")}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="dm-occ-title" className="text-section text-text-muted">{t("dayNumbers.occupied")}</h2>
            {numbers ? (
              <>
                <button type="button" onClick={() => open("occupied")} className={cx("press text-start", FOCUS_RING)} aria-label={`${t("dayNumbers.occupied")} ${t("hkHub.percent", { n: fmt.number(pct) })}, ${t("dmHub.occupiedRooms", { n: numbers.occupied, total: numbers.inventory })}`}>
                  <span className={cx("text-display text-text-primary", phone && "text-title-28")}>{t("hkHub.percent", { n: fmt.number(pct) })}</span>
                </button>
                <p className="text-body-16 text-text-secondary">{t("dmHub.occupiedRooms", { n: numbers.occupied, total: numbers.inventory })}</p>
              </>
            ) : (
              <p className="text-body-16 text-text-muted">—</p>
            )}
          </div>
          <div className={cx("flex flex-col gap-3", phone ? "" : "items-end")}>
            {planStatus}
            <Link href="/planung" className={cx("press text-body-18 inline-flex min-h-(--size-button-height) items-center justify-center gap-3 rounded-(--glass-radius-md) border border-border-accent bg-champagne px-8 py-3 text-text-on-accent", FOCUS_RING, phone && "w-full")}>
              <Glyph name="calendar-days" size={24} />
              <span>{t("dutyManager.planningLink")}</span>
            </Link>
          </div>
        </div>
        {numbers && <ProgressBar value={numbers.occupied} max={numbers.inventory} label={t("dmHub.occupiedRooms", { n: numbers.occupied, total: numbers.inventory })} />}
      </GlassCard>

      <div className={grid}>{main.map(tile)}</div>

      <GlassCard as="section" aria-labelledby="dm-floors-title" className="flex flex-col gap-4">
        <h2 id="dm-floors-title" className="text-title-22 text-text-primary">{t("dmHub.floorsTitle")}</h2>
        <ul className="flex flex-col gap-4">
          {floors.map((f) => (
            <li key={f.floor} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-18 text-text-primary">{t("glance.floorShort", { n: f.floor })}</span>
                <span className="text-label text-text-muted">
                  {f.rooms === 0 ? t("dmHub.noFloorRooms") : `${t("supHub.progress", { done: f.done, total: f.total })} · ${t("hkHub.percent", { n: fmt.number(f.percent) })}`}
                </span>
              </div>
              <ProgressBar value={f.done} max={f.total} label={`${t("glance.floorShort", { n: f.floor })}: ${t("supHub.progress", { done: f.done, total: f.total })}`} />
            </li>
          ))}
        </ul>
      </GlassCard>

      {day.length > 0 && (
        <section aria-label={t("dutyManager.dashboardTitle")} className="flex flex-col gap-3">
          <SectionLabel as="h2" icon="calendar-days" title={t("dutyManager.dashboardTitle")} />
          <div className={grid}>{day.map(tile)}</div>
          {numbers && numbers.notCleaned.total > 0 && (
            <Banner tone="info" icon="info" title={t("dayNumbers.notCleaned", { n: numbers.notCleaned.total, reasons: reasonsText(numbers, t) })} />
          )}
          {numbers && numbers.outsideTeam > 0 && <Banner tone="warning" title={t("dayNumbers.outsideTeam", { n: numbers.outsideTeam })} />}
        </section>
      )}

      <div className={grid}>{more.map(tile)}</div>
    </div>
  );
}

function reasonsText(n: DayNumbers, t: (k: TKey, v?: Record<string, string | number>) => string): string {
  return [
    n.notCleaned.byReason.outOfOrder && t("dayNumbers.reasonOutOfOrder", { n: n.notCleaned.byReason.outOfOrder }),
    n.notCleaned.byReason.outOfService && t("dayNumbers.reasonOutOfService", { n: n.notCleaned.byReason.outOfService }),
    n.notCleaned.byReason.optOut && t("dayNumbers.reasonOptOut", { n: n.notCleaned.byReason.optOut }),
  ].filter(Boolean).join(", ");
}
