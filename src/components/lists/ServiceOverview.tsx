"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { DAY_CATEGORY_STYLES } from "@/components/status";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { SERVICE_ORDER, needsCleaning, type ServiceKey, type ServiceOverview } from "@/lib/lists/serviceOverview";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";

type Data = ServiceOverview & { hub?: HubState };

const CATEGORY: Record<ServiceKey, RoomDayCategory> = { TURN: "SAME_DAY_TURN", DEPARTURE: "DEPARTURE", STAYOVER_LINEN: "STAYOVER", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL" };
const NAME: Record<ServiceKey, TKey> = { TURN: "service.TURN", DEPARTURE: "service.DEPARTURE", STAYOVER_LINEN: "service.STAYOVER_LINEN", STAYOVER: "service.STAYOVER", ARRIVAL: "service.ARRIVAL" };
const HINT: Record<ServiceKey, TKey> = { TURN: "service.TURN_hint", DEPARTURE: "service.DEPARTURE_hint", STAYOVER_LINEN: "service.STAYOVER_LINEN_hint", STAYOVER: "service.STAYOVER_hint", ARRIVAL: "service.ARRIVAL_hint" };
type Filter = ServiceKey | "SPECIAL" | null;

/**
 * Übersicht „Zimmer und Service heute“: oben die Zahlen (zu reinigen, je Service, Besonderheiten) als Filter, darunter je Etage
 * eine ruhige Liste — Zimmer, was es braucht, Besonderheiten (VIP, Anreisezeit, Allergiker, Twin/Zusatzbett …) und wer es macht.
 * Eine Quelle (Tagesplan), live per Socket.IO.
 */
export default function ServiceOverview() {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const [showArrivals, setShowArrivals] = useState(false);
  const load = useCallback(() => api<Data>("/api/lists/service").then(setData).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1200);
  useSocket({ "room:update": () => soon(), "assignments:applied": () => soon(), "dayplan:updated": () => soon(), "trace:update": () => soon() });

  const rooms = useMemo(() => {
    if (!data) return [];
    return data.rooms.filter((r) => {
      if (filter === "SPECIAL") return r.vip || r.allergy || r.extras.length > 0;
      if (filter) return r.service === filter;
      return showArrivals || needsCleaning(r.service);
    });
  }, [data, filter, showArrivals]);
  const floors = useMemo(() => [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b), [rooms]);

  if (!data) return <p className="text-sm text-graphite/60">{t("common.loading")}</p>;
  if (!data.date || data.floors.length === 0) return <p className="text-sm text-graphite/70">{data.floors.length === 0 && data.date ? t("service.noFloors") : t("service.noPlan")}</p>;

  const tile = (key: Filter, big: string, label: string, sub?: string) => (
    <button key={String(key)} type="button" aria-pressed={filter === key} onClick={() => setFilter((f) => (f === key ? null : key))}
      className={`min-h-16 rounded-xl border p-3 text-left transition ${filter === key ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/10 bg-white hover:border-gold-line"}`}>
      <div className="font-serif text-3xl leading-none">{big}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {sub && <div className="text-xs text-graphite/60">{sub}</div>}
    </button>
  );

  return (
    <div>
      <HubMissingNotice hub={data.hub} planner />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 rounded-xl border border-charcoal/15 bg-parchment/50 p-3 sm:col-span-3 lg:col-span-6">
          <span className="font-serif text-4xl">{data.counts.clean}</span>
          <span className="ml-2 text-base font-medium">{t("service.toClean")}</span>
          <span className="ml-2 text-xs text-graphite/60">{t("service.legendHint")}</span>
        </div>
        {SERVICE_ORDER.map((k) => tile(k, String(data.counts[k]), t(NAME[k]), t(HINT[k])))}
        {tile("SPECIAL", String(data.counts.special), t("service.special"), t("service.special_hint"))}
      </div>

      {(filter === null) && (
        <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={showArrivals} onChange={(e) => setShowArrivals(e.target.checked)} className="h-5 w-5" />
          {t("service.showArrivals")}
        </label>
      )}

      {floors.length === 0 ? <p className="text-sm text-graphite/60">{t("service.none")}</p> : floors.map((f) => {
        const rs = rooms.filter((r) => r.floor === f);
        return (
          <section key={f} className="mb-4" aria-label={t("planungTool.floorLabel", { n: f })}>
            <h4 className="mb-1.5 flex items-baseline gap-2 border-b border-charcoal/10 pb-1 font-serif text-xl">
              {t("planungTool.floorLabel", { n: f })} <span className="font-sans text-xs text-graphite/60">· {rs.filter((r) => needsCleaning(r.service)).length} {t("service.toCleanShort")}</span>
            </h4>
            <ul className="space-y-1.5">
              {rs.map((r) => {
                const style = DAY_CATEGORY_STYLES[CATEGORY[r.service]];
                return (
                  <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-white p-2.5 ${r.done ? "border-status-clean/30 opacity-70" : "border-charcoal/10"}`}>
                    <span className="w-14 font-serif text-2xl leading-none">{r.number}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${style.chip}`}>{t(NAME[r.service])}</span>
                    <span className="flex flex-wrap items-center gap-1 text-[0.7rem] font-semibold">
                      {r.vip && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-gold-soft">★ VIP</span>}
                      {r.eta && <span className="rounded-full bg-parchment px-2 py-0.5">{t("service.eta", { time: r.eta })}</span>}
                      {r.allergy && <span className="rounded-full bg-parchment px-2 py-0.5">{t("service.allergy")}</span>}
                      {r.dnd && <span className="rounded-full bg-status-blocked/10 px-2 py-0.5 text-status-blocked">DND</span>}
                    </span>
                    {r.extras.length > 0 && (
                      <ul className="flex min-w-0 flex-1 flex-wrap gap-1 text-xs">
                        {r.extras.map((x, i) => <li key={i} className={`rounded-md border px-2 py-0.5 ${x.done ? "border-status-clean/30 text-graphite/50 line-through" : "border-charcoal/15"}`}>{x.dept === "HOUSEMAN" ? `${t("service.houseman")}: ` : ""}{x.label}</li>)}
                      </ul>
                    )}
                    <span className="ml-auto text-xs text-graphite/70">
                      {needsCleaning(r.service) ? (r.assignedToName ? `→ ${r.assignedToName}` : <span className="font-medium text-gold-soft">{t("service.unassigned")}</span>) : ""}
                      {r.credits > 0 && <span className="ml-2 text-graphite/50">{r.credits} Cr.</span>}
                      {r.done && <span className="ml-2 text-status-clean">✓</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
