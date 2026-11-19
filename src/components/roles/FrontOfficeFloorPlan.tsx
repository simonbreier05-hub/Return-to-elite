"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useRoomLookup } from "@/components/useRoomLookup";
import RoomDetailModal from "@/components/RoomDetailModal";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import RoomWindowActions from "@/components/roles/RoomWindowActions";
import { Banner, FilterChip, GlassCard } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { hhmm } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/translations";

interface FoRoom {
  id: string;
  number: string;
  floor: number;
  status: string;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  blockReason?: string | null;
  oooUntil?: string | null;
  guestDndActive?: boolean;
  arrivals: { eta?: string | null; vip?: boolean; neededNow?: boolean }[];
}

type Filter = "all" | "arrivals" | "departures" | "ready" | "problems";

const isBlocked = (r: FoRoom) => r.status === "OUT_OF_ORDER" || !!r.oooUntil; // F2-Sperre; OOS bleibt verkaufbar
const isReady = (r: FoRoom) => r.status === "INSPECTED" && r.occupancy !== "OCCUPIED" && !isBlocked(r);
const MATCH: Record<Filter, (r: FoRoom) => boolean> = {
  all: () => true,
  arrivals: (r) => r.arrivals.length > 0,
  departures: (r) => r.isCheckoutToday,
  ready: isReady,
  problems: (r) => isBlocked(r) || r.status === "BLOCKED" || r.status === "DEFECT_REPORTED" || !!r.guestDndActive || (r.arrivals.length > 0 && r.status !== "INSPECTED"),
};

/**
 * Simon-Feedback 19.11.2026: Zimmer-Hub fürs Front Office — dieselbe Etagen-Sicht wie der Grundriss von DM/Supervisor, aber
 * vereinfacht auf das, was das Front Office braucht: frei/belegt, Reinigungsstand, Anreise (mit Uhrzeit), Abreise, Sperre, DND.
 * Keine Zuteilung, keine Sollzeiten, keine Gastnamen auf der Kachel. Antippen öffnet das Zimmerfenster; dort sitzen
 * Zimmerwechsel und „Reist heute ab“ (`RoomWindowActions`). Daten: `GET /api/rooms?allFloors=1`, live über `room:update`.
 */
export default function FrontOfficeFloorPlan() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<FoRoom[] | null>(null);
  const [hub, setHub] = useState<HubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const lookup = useRoomLookup();

  const load = useCallback(async () => {
    try {
      const d = await api<{ rooms: FoRoom[]; hub?: HubState }>("/api/rooms?allFloors=1");
      setRooms(Array.isArray(d.rooms) ? d.rooms : []);
      setHub(d.hub ?? null);
      setError(null);
    } catch (e) { setError(errorText(e, t)); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => void load(), 1500);
  useSocket({ "room:update": soon, "dayplan:updated": soon, "arrival:update": soon, "app:resync": soon });

  const counts = useMemo(() => {
    const list = rooms ?? [];
    return Object.fromEntries((Object.keys(MATCH) as Filter[]).map((k) => [k, list.filter(MATCH[k]).length])) as Record<Filter, number>;
  }, [rooms]);
  const floors = useMemo(() => {
    const m = new Map<number, FoRoom[]>();
    for (const r of rooms ?? []) if (MATCH[filter](r)) (m.get(r.floor) ?? m.set(r.floor, []).get(r.floor)!).push(r);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [rooms, filter]);

  const FILTERS: { key: Filter; label: TKey }[] = [
    { key: "all", label: "foPlan.filterAll" },
    { key: "arrivals", label: "foPlan.filterArrivals" },
    { key: "departures", label: "foPlan.filterDepartures" },
    { key: "ready", label: "foPlan.filterReady" },
    { key: "problems", label: "foPlan.filterProblems" },
  ];

  return (
    <div className="theme-glass flex flex-col gap-4 sm:gap-6" data-testid="fo-floor-plan">
      <HubMissingNotice hub={hub} planner={false} glass />
      {error && <Banner tone="warning" title={error} />}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("foPlan.filterLabel")}>
        {FILTERS.map((f) => (
          <FilterChip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {t(f.label)} · {counts[f.key]}
          </FilterChip>
        ))}
      </div>
      {rooms && floors.length === 0 && <p className="text-body-16 text-text-muted">{t("foPlan.empty")}</p>}
      {floors.map(([floor, list]) => (
        <GlassCard as="section" key={floor} aria-labelledby={`fo-floor-${floor}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`fo-floor-${floor}`} className="text-title-22 text-text-primary">{t("supervisor.floorN", { floor })}</h2>
            <span className="text-label text-text-muted">
              {t("foPlan.floorSummary", { free: list.filter(isReady).length, occupied: list.filter((r) => r.occupancy === "OCCUPIED").length })}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {list.map((r) => <li key={r.id}><Tile room={r} onOpen={() => lookup.open(r.number)} /></li>)}
          </ul>
        </GlassCard>
      ))}
      {lookup.room && (
        <RoomDetailModal room={lookup.room} onClose={lookup.close}
          editor={<RoomWindowActions room={lookup.room} onChanged={() => { void load(); }} />} />
      )}
    </div>
  );
}

function Tile({ room: r, onOpen }: { room: FoRoom; onOpen: () => void }) {
  const { t } = useLocale();
  const blocked = isBlocked(r);
  const ready = isReady(r);
  const arrival = r.arrivals[0];
  const arrivalNotReady = !!arrival && r.status !== "INSPECTED";
  const tags: { text: string; tone: "ok" | "accent" | "warn" | "muted" }[] = [];
  if (arrival) tags.push({ text: arrival.eta ? t("foPlan.arrivalAt", { time: hhmm(arrival.eta) }) : t("foPlan.arrival"), tone: arrivalNotReady ? "warn" : "ok" });
  if (r.isCheckoutToday) tags.push({ text: t("foPlan.departure"), tone: "accent" });
  if (blocked) tags.push({ text: t("foPlan.blocked"), tone: "warn" });
  if (r.guestDndActive) tags.push({ text: t("floorPlanRef.guestDnd"), tone: "muted" });
  const TONE = { ok: "bg-status-success-bg text-status-success-fg", accent: "bg-accent-subtle-bg text-accent-text", warn: "bg-status-danger-bg text-status-danger-fg", muted: "bg-surface-progress-track text-text-secondary" };
  return (
    <button type="button" onClick={onOpen}
      aria-label={[r.number, r.occupancy === "OCCUPIED" ? t("floorPlanRef.occupied") : t("foPlan.vacant"), t(`status.${r.status}` as TKey), ...tags.map((x) => x.text)].join(", ")}
      className={cx("press flex min-h-24 w-full flex-col items-start gap-1 rounded-(--glass-radius-md) border bg-surface-card-raised p-3 text-start",
        ready ? "border-status-success-fg/60" : arrivalNotReady ? "border-status-warning-fg/60" : "border-border-subtle", FOCUS_RING)}>
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="text-title-22 text-text-primary">{r.number}</span>
        <span className="text-label text-text-muted">{r.occupancy === "OCCUPIED" ? t("floorPlanRef.occupied") : t("foPlan.vacant")}</span>
      </span>
      <span className={cx("text-label", ready ? "text-status-success-fg" : "text-text-secondary")}>{t(`status.${r.status}` as TKey)}</span>
      {tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {tags.map((x) => <span key={x.text} className={cx("text-label rounded-pill px-2 py-0.5", TONE[x.tone])}>{x.text}</span>)}
        </span>
      )}
    </button>
  );
}
