"use client";

import type { ReactNode } from "react";
import DayNumberTiles from "@/components/DayNumberTiles";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";
import type { GlanceKpis } from "@/lib/dayplan/glance";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * „Heute auf einen Blick“: Tageszahlen (DayNumberTiles, eine Zahlenquelle) und die Kennzahlen-Leiste. Gemeinsam für den
 * Duty-Manager-Screen und die Supervisor-Startansicht (dort mit den Zahlen der eigenen Etagen) — kein zweiter Aufbau.
 */
export default function TodayAtAGlance({ title, numbers, kpis, extraKpi, children }: {
  title?: string;
  numbers: DayNumbers | null;
  kpis: GlanceKpis | null;
  /** Zusätzliche Kachel am Ende der Leiste (Duty Manager: Etagen ohne Supervisor). */
  extraKpi?: { label: string; value: number };
  /** Unter der Leiste, z. B. die Hauszahlen als Orientierung. */
  children?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section aria-label={title ?? t("dutyManager.dashboardTitle")} className="mb-6">
      <h3 className="mb-2 font-serif text-xl">{title ?? t("dutyManager.dashboardTitle")}</h3>
      {numbers && <DayNumberTiles className="mb-3" numbers={numbers} />}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi label={t("dutyManager.arrivalsToday")} value={kpis.arrivals} />
          <Kpi label={t("dutyManager.departuresToday")} value={kpis.departures} />
          <Kpi label={t("dutyManager.dndRooms")} value={kpis.dnd} accent={kpis.dnd > 0} />
          <Kpi label={t("dutyManager.openDefects")} value={kpis.openDefects} accent={kpis.openDefects > 0} />
          <Kpi label={t("dutyManager.openHouseTasks")} value={kpis.openHouseTasks} accent={kpis.openHouseTasks > 0} />
          {extraKpi && <Kpi label={extraKpi.label} value={extraKpi.value} accent={extraKpi.value > 0} />}
        </div>
      )}
      {children}
    </section>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-gold/40 bg-gold/10" : "border-charcoal/10 bg-white"}`}>
      <div className="text-xs uppercase tracking-wider text-graphite/60">{label}</div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
    </div>
  );
}
