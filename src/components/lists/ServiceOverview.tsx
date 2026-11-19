"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { SERVICE_ORDER, needsCleaning, type ServiceKey, type ServiceOverview } from "@/lib/lists/serviceOverview";
import LiveRoomModal from "./LiveRoomModal";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import DayNumberTiles from "@/components/DayNumberTiles";
import { PauseBadge } from "@/components/PauseControl";
import { usePersistedSet } from "@/components/usePersistedSet";
import { serviceFloorSummary } from "@/lib/lists/serviceFloorSummary";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";
import { CATEGORY_PILL_TONE } from "@/lib/ui/pill-tone";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { Button, GlassCard, Pill } from "@/components/ui";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";

type Data = ServiceOverview & { hub?: HubState; numbers?: DayNumbers | null };

const CATEGORY: Record<ServiceKey, RoomDayCategory> = { TURN: "SAME_DAY_TURN", DEPARTURE: "DEPARTURE", STAYOVER_LINEN: "STAYOVER", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL" };
const NAME: Record<ServiceKey, TKey> = { TURN: "service.TURN", DEPARTURE: "service.DEPARTURE", STAYOVER_LINEN: "service.STAYOVER_LINEN", STAYOVER: "service.STAYOVER", ARRIVAL: "service.ARRIVAL" };
const HINT: Record<ServiceKey, TKey> = { TURN: "service.TURN_hint", DEPARTURE: "service.DEPARTURE_hint", STAYOVER_LINEN: "service.STAYOVER_LINEN_hint", STAYOVER: "service.STAYOVER_hint", ARRIVAL: "service.ARRIVAL_hint" };
type Filter = ServiceKey | "SPECIAL" | null;

/**
 * Übersicht „Zimmer und Service heute“: oben die Zahlen (zu reinigen, je Service, Besonderheiten) als Filter, darunter je Etage
 * eine ruhige Liste — Zimmer, was es braucht, Besonderheiten (VIP, Anreisezeit, Allergiker, Twin/Zusatzbett …) und wer es macht.
 * Eine Quelle (Tagesplan), live per Socket.IO. Simon-Feedback 19.11.2026: im Design der App („Glas & Premium“).
 */
export default function ServiceOverview() {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Filter>(null);
  const [showArrivals, setShowArrivals] = useState(false);
  const [roomRef, setRoomRef] = useState<string | null>(null);
  // H2 Schritt 8: Etagen standardmäßig zu, offene Etagen merkt sich der Bildschirm für die Sitzung
  const [openFloors, toggleFloor, setOpenFloors] = usePersistedSet("stayclean.service.openFloors");
  const load = useCallback(() => api<Data>("/api/lists/service").then(setData).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1200);
  useSocket({ "app:resync": () => soon(), "room:update": () => soon(), "assignments:applied": () => soon(), "dayplan:updated": () => soon(), "trace:update": () => soon(), "work:pause": () => soon() });

  const rooms = useMemo(() => {
    if (!data) return [];
    return data.rooms.filter((r) => {
      if (filter === "SPECIAL") return r.vip || r.allergy || r.extras.length > 0;
      if (filter) return r.service === filter;
      return showArrivals || needsCleaning(r.service, r.status);
    });
  }, [data, filter, showArrivals]);
  const floors = useMemo(() => [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b), [rooms]);

  if (!data) return <p className="text-body-16 text-text-muted">{t("common.loading")}</p>;
  if (!data.date || data.floors.length === 0) return (
    <div className="flex flex-col gap-3">
      {data.numbers && <DayNumberTiles numbers={data.numbers} />}
      <p className="text-body-16 text-text-muted">{data.floors.length === 0 && data.date ? t("service.noFloors") : t("service.noPlan")}</p>
    </div>
  );

  const tile = (key: Filter, big: string, label: string, sub?: string) => (
    <button key={String(key)} type="button" aria-pressed={filter === key} onClick={() => setFilter((f) => (f === key ? null : key))}
      className={cx("press flex min-h-20 flex-col items-start gap-1 rounded-(--glass-radius-md) border p-3 text-start",
        filter === key ? "glass-selected border-border-accent bg-accent-subtle-bg" : "border-border-subtle bg-surface-card-raised", FOCUS_RING)}>
      <span className="text-title-28 text-text-primary">{big}</span>
      <span className="text-body-16 text-text-primary">{label}</span>
      {sub && <span className="text-label text-text-muted">{sub}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <HubMissingNotice hub={data.hub} planner glass />
      {data.numbers && <DayNumberTiles numbers={data.numbers} />}
      <GlassCard as="section" aria-label={t("service.title")} className="flex flex-col gap-3">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-title-28 text-text-primary">{data.counts.clean}</span>
          <span className="text-body-18 text-text-primary">{data.numbers && data.numbers.toClean !== data.counts.clean ? t("service.toCleanFloors") : t("service.toClean")}</span>
          <span className="text-label text-text-muted">{t("service.legendHint")}</span>
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {SERVICE_ORDER.map((k) => tile(k, String(data.counts[k]), t(NAME[k]), t(HINT[k])))}
          {tile("SPECIAL", String(data.counts.special), t("service.special"), t("service.special_hint"))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {filter === null ? (
            <label className="text-body-16 flex min-h-(--size-touch-min) items-center gap-3 text-text-primary">
              <input type="checkbox" checked={showArrivals} onChange={(e) => setShowArrivals(e.target.checked)} className="size-5 accent-[var(--color-accent-text)]" />
              {t("service.showArrivals")}
            </label>
          ) : <span />}
          {floors.length > 0 && (
            <Button variant="secondary" icon={openFloors.size >= floors.length ? "chevron-up" : "chevron-down"}
              onClick={() => setOpenFloors(openFloors.size >= floors.length ? [] : floors.map(String))}>
              {openFloors.size >= floors.length ? t("service.collapseAll") : t("service.expandAll")}
            </Button>
          )}
        </div>
      </GlassCard>

      {floors.length === 0 ? <p className="text-body-16 text-text-muted">{t("service.none")}</p> : floors.map((f) => {
        const rs = rooms.filter((r) => r.floor === f);
        const all = data.rooms.filter((r) => r.floor === f);
        const sum = serviceFloorSummary(all);
        const isOpen = filter !== null || openFloors.has(String(f)); // Filter aktiv → Treffer sichtbar
        return (
          <GlassCard as="section" key={f} padded={false} aria-label={t("planungTool.floorLabel", { n: f })}>
            <button type="button" onClick={() => toggleFloor(String(f))} aria-expanded={isOpen}
              className={cx("press flex min-h-(--size-touch-min) w-full items-center justify-between gap-3 p-4 text-start sm:px-6", FOCUS_RING)}>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-title-22 text-text-primary">{t("planungTool.floorLabel", { n: f })}</span>
                  <span className="text-label text-text-muted">· {rs.filter((r) => needsCleaning(r.service, r.status)).length} {t("service.toCleanShort")}</span>
                  {sum.dnd > 0 && <Pill tone="danger">{t("service.floorDnd", { n: sum.dnd })}</Pill>}
                </span>
                <span className="text-label block text-text-secondary">
                  {t("service.floorFacts", { rooms: sum.rooms, dep: sum.departures, stay: sum.stayovers, arr: sum.arrivals, done: sum.done, total: sum.total })} · {sum.credits} {t("shared.creditsShort")}
                </span>
              </span>
              <Glyph name="chevron-down" size={20} className={cx("shrink-0 text-text-secondary transition-transform duration-150", isOpen && "rotate-180")} />
            </button>
            {isOpen && <ul className="flex flex-col gap-2 border-t border-border-subtle p-3 sm:px-4">
              {rs.map((r) => (
                <li key={r.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-(--glass-radius-md) border bg-surface-card-raised p-3",
                  r.done ? "border-status-success-fg/40 opacity-70" : "border-border-subtle")}>
                  <button type="button" onClick={() => setRoomRef(r.id)} aria-label={t("lists.hmOpenRoom", { n: r.number })}
                    className={cx("text-title-22 min-h-(--size-touch-min) w-16 text-start text-text-primary underline decoration-border-subtle underline-offset-4", FOCUS_RING)}>{r.number}</button>
                  <Pill tone={CATEGORY_PILL_TONE[CATEGORY[r.service]]}>{t(NAME[r.service])}</Pill>
                  {r.vip && <Pill tone="accent">★ {t("shared.vip")}</Pill>}
                  {r.eta && <Pill tone="info">{t("service.eta", { time: r.eta })}</Pill>}
                  {r.allergy && <Pill tone="warning">{t("service.allergy")}</Pill>}
                  {r.dnd && <Pill tone="danger">DND</Pill>}
                  <PauseBadge pause={r.pause} showBy />
                  {r.extras.length > 0 && (
                    <ul className="text-label flex min-w-0 flex-1 flex-wrap gap-1">
                      {r.extras.map((x, i) => (
                        <li key={i} className={cx("rounded-pill border px-3 py-1", x.done ? "border-status-success-fg/40 text-text-muted line-through" : "border-border-subtle text-text-secondary")}>{x.label}</li>
                      ))}
                    </ul>
                  )}
                  <span className="text-label ms-auto text-text-secondary">
                    {needsCleaning(r.service, r.status) ? (r.assignedToName ? `→ ${r.assignedToName}` : <span className="text-accent-text">{t("service.unassigned")}</span>) : ""}
                    {r.credits > 0 && <span className="ms-2 text-text-muted">{r.credits} {t("shared.creditsShort")}</span>}
                    {r.done && <Glyph name="check" size={16} className="ms-2 inline text-status-success-fg" />}
                  </span>
                </li>
              ))}
            </ul>}
          </GlassCard>
        );
      })}
      {roomRef && <LiveRoomModal roomRef={roomRef} onClose={() => setRoomRef(null)} onChanged={() => { void load(); }} />}
    </div>
  );
}
