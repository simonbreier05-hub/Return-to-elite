"use client";

import type { ReactNode } from "react";
import DayNumberTiles from "@/components/DayNumberTiles";
import { GlanceDetailHost, GlanceTile, useGlanceDetail, type DetailContent, type DetailItem } from "@/components/GlanceDetailSheet";
import { rowsOnFloors, type DayNumberRow, type DayNumbers } from "@/lib/dayplan/dayNumbers";
import { dndBlockedSummary, type GlanceKpis, type GlanceRoom } from "@/lib/dayplan/glance";
import { dayTileRows, type DayTileKey } from "@/lib/dayplan/glanceDetails";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

/** Daten hinter den Kacheln (dieselben, aus denen die Zahlen kommen) — für die Detailansicht. */
export interface GlanceSource {
  rooms: (GlanceRoom & { id: string; number: string; assignedTo?: { id: string; name: string } | null })[];
  /** Zeilen aus `/api/day-numbers` (ganzes Haus; mit `floors` gefiltert). */
  rows: DayNumberRow[];
  workOrders: { id: string; status: string; floor?: number | null; roomNumber?: string; category?: string }[];
  roomTasks: { id: string; status: string; floor?: number | null; roomNumber?: string; type?: string }[];
  /** Supervisor: nur diese Etagen; `null` = ganzes Haus (Duty Manager). */
  floors?: number[] | null;
}

type Key = DayTileKey | "arrivals" | "departures" | "dnd" | "dndBlocked" | "progress" | "openDefects" | "openHouseTasks" | "extra";

/**
 * „Heute auf einen Blick“: Tageszahlen (DayNumberTiles, eine Zahlenquelle) und die Kennzahlen-Leiste. Gemeinsam für den
 * Duty-Manager-Screen und die Supervisor-Startansicht (dort mit den Zahlen der eigenen Etagen) — kein zweiter Aufbau.
 * Jede Kachel ist antippbar und öffnet dieselbe Detailansicht (`GlanceDetailSheet`), Zimmer darin öffnen das Zimmer-Detail.
 * `variant="supervisor"`: statt der DND-Kachel „DND/Blockiert“ und zusätzlich „Tagesfortschritt“; Duty Manager unverändert.
 */
export default function TodayAtAGlance({ title, numbers, kpis, source, variant = "dutyManager", extraKpi, onChanged, children }: {
  title?: string;
  numbers: DayNumbers | null;
  kpis: GlanceKpis | null;
  source?: GlanceSource;
  variant?: "dutyManager" | "supervisor";
  /** Zusätzliche Kachel am Ende der Leiste (Duty Manager: Etagen ohne Supervisor), mit eigener Detailansicht. */
  extraKpi?: { label: string; value: number; detail?: DetailContent };
  onChanged?: () => void;
  /** Unter der Leiste, z. B. die Hauszahlen als Orientierung. */
  children?: ReactNode;
}) {
  const { t } = useLocale();
  const detail = useGlanceDetail<Key>();
  const content = detail.key ? buildContent(detail.key) : null;

  function buildContent(key: Key): DetailContent | null {
    const floors = source?.floors ?? null;
    const on = (f: number | null | undefined) => !floors || (f != null && floors.includes(f));
    const rooms = (source?.rooms ?? []).filter((r) => on(r.floor));
    const names = new Map((source?.rooms ?? []).flatMap((r) => (r.assignedTo ? [[r.assignedTo.id, r.assignedTo.name] as const] : [])));
    const status = (s: string) => t(`status.${s}` as TKey);
    const floorOf = (f: number | null | undefined) => (f != null ? t("glance.floorShort", { n: f }) : "");
    const roomItem = (r: { id: string; number: string; floor: number }, meta: string, tone?: DetailItem["tone"]): DetailItem =>
      ({ key: r.id, title: r.number, roomRef: r.id, meta: [floorOf(r.floor), meta].filter(Boolean).join(" · "), tone });
    const label = (k: Key) => ({
      occupied: t("dayNumbers.occupied"), toClean: t("dayNumbers.toClean"), assigned: t("dayNumbers.assigned"), cleaned: t("dayNumbers.cleaned"),
      open: t("dayNumbers.open"), laundry: t("dayNumbers.laundry"), arrivalChecks: t("dayNumbers.arrivalChecks"), notCleaned: t("glance.notCleanedTitle"),
      arrivals: t("dutyManager.arrivalsToday"), departures: t("dutyManager.departuresToday"), dnd: t("dutyManager.dndRooms"),
      dndBlocked: t("glance.dndBlockedTile"), progress: t("glance.progressTile"), openDefects: t("dutyManager.openDefects"),
      openHouseTasks: t("dutyManager.openHouseTasks"), extra: extraKpi?.label ?? "",
    })[k];

    switch (key) {
      case "extra": return extraKpi?.detail ?? null;
      case "arrivals":
        return { title: label(key), sections: [{ items: rooms.filter((r) => (r.arrivals?.length ?? 0) > 0).map((r) => roomItem(r, `${t("glance.arrivalsCount", { n: r.arrivals?.length ?? 0 })} · ${status(r.status)}`)) }] };
      case "departures":
        return { title: label(key), sections: [{ items: rooms.filter((r) => r.isCheckoutToday).map((r) => roomItem(r, status(r.status))) }] };
      case "dnd":
        return { title: label(key), sections: [{ items: rooms.filter((r) => r.status === "BLOCKED" && r.blockReason === "DND").map((r) => roomItem(r, status(r.status))) }] };
      case "dndBlocked": {
        const s = dndBlockedSummary(rooms);
        const src = { GUEST: t("glance.dndGuest"), STAFF: t("glance.dndStaff"), BOTH: t("glance.dndBoth") };
        return {
          title: label(key),
          sections: [
            { title: t("glance.dndSection"), items: s.dnd.map((r) => roomItem(r, src[r.source], "accent")) },
            { title: t("glance.blockedSection"), items: s.blocked.map((r) => roomItem(r, r.reason ? t(`blockReason.${r.reason}` as TKey) : t("glance.noReason"))) },
          ],
        };
      }
      case "progress": {
        const sellable = rooms.filter((r) => !["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status));
        return {
          title: label(key),
          subtitle: kpis ? t("glance.progressSub", { done: kpis.progress.inspected, total: kpis.progress.sellable }) : undefined,
          sections: [
            { title: t("glance.toCheck"), items: sellable.filter((r) => r.status !== "INSPECTED").map((r) => roomItem(r, `${status(r.status)}${r.assignedTo ? ` · ${r.assignedTo.name}` : ""}`)) },
            { title: t("glance.released"), items: sellable.filter((r) => r.status === "INSPECTED").map((r) => roomItem(r, status(r.status), "ok")) },
          ],
        };
      }
      case "openDefects":
        return { title: label(key), sections: [{ items: (source?.workOrders ?? []).filter((w) => w.status !== "RESOLVED" && on(w.floor)).map((w) => ({
          key: w.id, title: w.roomNumber ?? "—", roomRef: w.roomNumber,
          meta: [floorOf(w.floor), w.category ? t(`defectCategory.${w.category}` as TKey) : "", t(`workOrderStatus.${w.status}` as TKey)].filter(Boolean).join(" · "),
        })) }] };
      case "openHouseTasks":
        return { title: label(key), sections: [{ items: (source?.roomTasks ?? []).filter((x) => x.status === "OPEN" && on(x.floor)).map((x) => ({
          key: x.id, title: x.roomNumber ?? "—", roomRef: x.roomNumber,
          meta: [floorOf(x.floor), x.type ? t(`roomTaskType.${x.type}` as TKey) : ""].filter(Boolean).join(" · "),
        })) }] };
      default: {
        const rows = floors ? rowsOnFloors(source?.rows ?? [], floors) : source?.rows ?? [];
        const items = dayTileRows(key, rows, numbers).map((r) => roomItem(
          { id: r.id, number: r.number, floor: r.floor ?? 0 },
          [t(`glance.kind${r.kind}` as TKey), status(r.status),
            key === "arrivalChecks" ? t(r.flag === "released" ? "glance.released" : "glance.toCheck") : r.assignedToId ? names.get(r.assignedToId) ?? t("glance.assignedShort") : t("glance.unassignedShort")].join(" · "),
          r.flag === "released" ? "ok" : undefined,
        ));
        return { title: label(key), sections: [{ items }] };
      }
    }
  }

  const sup = variant === "supervisor";
  return (
    <section aria-label={title ?? t("dutyManager.dashboardTitle")} className="mb-6">
      <h3 className="mb-2 font-serif text-xl">{title ?? t("dutyManager.dashboardTitle")}</h3>
      {source && <p className="mb-2 text-xs text-graphite/60">{t("glance.tapHint")}</p>}
      {numbers && <DayNumberTiles className="mb-3" numbers={numbers} onTile={source ? detail.open : undefined} />}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {sup && <GlanceTile label={t("glance.progressTile")} value={`${kpis.progress.percent}%`} sub={t("glance.progressSub", { done: kpis.progress.inspected, total: kpis.progress.sellable })} bar={kpis.progress.percent} onClick={() => detail.open("progress")} />}
          <GlanceTile label={t("dutyManager.arrivalsToday")} value={kpis.arrivals} onClick={() => detail.open("arrivals")} />
          <GlanceTile label={t("dutyManager.departuresToday")} value={kpis.departures} onClick={() => detail.open("departures")} />
          {sup
            ? <GlanceTile label={t("glance.dndBlockedTile")} value={`${kpis.dndBlocked.dnd} · ${kpis.dndBlocked.blocked}`} sub={t("glance.dndBlockedValue", { dnd: kpis.dndBlocked.dnd, blocked: kpis.dndBlocked.blocked })}
                accent={kpis.dndBlocked.dnd + kpis.dndBlocked.blocked > 0} onClick={() => detail.open("dndBlocked")} />
            : <GlanceTile label={t("dutyManager.dndRooms")} value={kpis.dnd} accent={kpis.dnd > 0} onClick={() => detail.open("dnd")} />}
          <GlanceTile label={t("dutyManager.openDefects")} value={kpis.openDefects} accent={kpis.openDefects > 0} onClick={() => detail.open("openDefects")} />
          <GlanceTile label={t("dutyManager.openHouseTasks")} value={kpis.openHouseTasks} accent={kpis.openHouseTasks > 0} onClick={() => detail.open("openHouseTasks")} />
          {extraKpi && <GlanceTile label={extraKpi.label} value={extraKpi.value} accent={extraKpi.value > 0} onClick={() => detail.open("extra")} />}
        </div>
      )}
      {children}
      <GlanceDetailHost state={detail} content={content} onChanged={onChanged} />
    </section>
  );
}
