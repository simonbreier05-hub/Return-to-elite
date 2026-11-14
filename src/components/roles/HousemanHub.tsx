"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";
import { HM_FILTER_LABEL, hmFilterCounts, hmKpis, hmMetaTime, hmPill, matchesHmFilter, type HmFilter, type HmItemView } from "@/lib/ui/housemanHub";
import type { PauseInfo } from "@/components/PauseControl";
import { HkNoteThread } from "@/components/hk/HkParts";
import { DetailContainer } from "@/components/shell/DetailContainer";
import type { Breakpoint } from "@/components/shell/useBreakpoint";
import { Banner, Button, FilterChip, Pill } from "@/components/ui";
import { DETAIL_FIT, DetailLine, RoleHub } from "./RoleHub";
import { RolePause } from "./RolePause";
import { RecurringTasksPanel } from "./RecurringTasksPanel";

export interface HousemanHubProps {
  items: HmItemView[];
  floors: number[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Abhaken/Zurücknehmen (Trace) bzw. Erledigt (Aufgabe) — gleiche Wege wie bisher. */
  onToggle: (item: HmItemView) => void;
  busyKey: string | null;
  actionError: string | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onPauseChanged: (item: HmItemView, pause: PauseInfo | null) => void;
  notices?: ReactNode;
  /** Nur Tests/Demo: Detail-Darstellung erzwingen. */
  detailMode?: Breakpoint;
}

/**
 * Hausmann-Hub „Glas & Premium“ (Figma `36:1589`, Handy `41:2654`): Kennzahlen, eine Liste aus Hausmann-Traces und
 * von Hand angelegten Aufgaben, Filter (Alle/Offen/Traces/Erledigt + Etage), Detail mit „Erledigt“, Pause und
 * Nachrichten/Rückfrage an alle Beteiligten. Reine Darstellung — Daten von `app/houseman/view.tsx`.
 */
export function HousemanHub(p: HousemanHubProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<HmFilter>("all");
  const [floor, setFloor] = useState<number | null>(null);

  const activeFloor = floor !== null && p.floors.includes(floor) ? floor : null;
  const counts = useMemo(() => hmFilterCounts(p.items, activeFloor), [p.items, activeFloor]);
  const active: HmFilter = counts.some((c) => c.filter === filter) ? filter : "all";
  const visible = p.items.filter((i) => matchesHmFilter(i, active, activeFloor));
  const k = hmKpis(p.items);

  const label = (i: HmItemView) => {
    if (i.kind === "trace") return i.text || t("roleHub.trace");
    if (i.taskType === "SONSTIGES" || !i.taskType) return i.text || t("roomTaskType.SONSTIGES");
    return t(`roomTaskType.${i.taskType}` as TKey);
  };
  const subtitle = (i: HmItemView) => {
    if (i.status === "DONE" && i.doneAt) return t("lists.hmDoneAt", { time: hhmm(i.doneAt) });
    if (i.kind === "trace") return [i.guest, i.waitsForDeparture ? t("lists.hmWaitsDeparture") : null].filter(Boolean).join(" · ") || (i.floor !== null ? t("lists.floorN", { n: i.floor }) : "");
    return i.requestedBy ? t("houseman.requestedBy", { name: i.requestedBy }) : "";
  };
  const meta = (i: HmItemView) => {
    const m = hmMetaTime(i);
    return m ? (m.kind === "iso" ? hhmm(m.value) : m.value) : undefined;
  };

  const sel = p.selectedKey ? p.items.find((i) => i.key === p.selectedKey) ?? null : null;

  const detail = sel && (() => {
    const pill = hmPill(sel);
    const busy = p.busyKey === sel.key;
    const footer =
      sel.status === "OPEN" ? (
        <Button icon="check" block onClick={() => p.onToggle(sel)} disabled={busy}>
          {busy ? "…" : t("lists.hmTick")}
        </Button>
      ) : sel.kind === "trace" ? (
        <Button variant="secondary" icon="refresh" block onClick={() => p.onToggle(sel)} disabled={busy}>
          {busy ? "…" : t("lists.hmUntick")}
        </Button>
      ) : undefined;
    return (
      <DetailContainer open forceMode={p.detailMode} className={DETAIL_FIT} onClose={() => p.onSelect(null)} title={t("hkHub.roomTitle", { n: sel.roomNumber })} footer={footer}>
        <div className="flex flex-col gap-4" data-testid="hm-detail">
          <div className="flex flex-wrap gap-2">
            <Pill tone={pill.tone}>{t(pill.labelKey)}</Pill>
            {sel.status === "OPEN" && sel.times[0] && <Pill tone="neutral">{t("roleHub.byTime", { time: sel.times[sel.times.length - 1] })}</Pill>}
            {sel.floor !== null && <Pill tone="neutral">{t("lists.floorN", { n: sel.floor })}</Pill>}
          </div>
          <DetailLine icon="bed-single">{label(sel)}</DetailLine>
          {sel.guest && <DetailLine icon="user">{sel.guest}</DetailLine>}
          {sel.times.length > 0 && <DetailLine icon="clock">{t("lists.hmTimes", { list: sel.times.join(", ") })}</DetailLine>}
          {sel.requestedBy && <DetailLine icon="users">{t("houseman.requestedBy", { name: sel.requestedBy })}</DetailLine>}
          {sel.status === "DONE" && sel.doneAt && <DetailLine icon="check">{t("lists.hmDoneAt", { time: hhmm(sel.doneAt) })}</DetailLine>}
          {sel.waitsForDeparture && sel.status === "OPEN" && <Banner tone="warning" icon="clock" title={t("lists.hmWaitsDeparture")} />}
          {p.actionError && (
            <div role="alert">
              <Banner tone="warning" icon="triangle-alert" title={p.actionError} />
            </div>
          )}
          {sel.roomId && <HkNoteThread key={sel.key} roomId={sel.roomId} initialNotes={[]} task={{ type: sel.kind === "trace" ? "TRACE" : "ROOMTASK", id: sel.id }} />}
          {sel.status === "OPEN" && (
            <RolePause targetType={sel.kind === "trace" ? "TRACE" : "ROOMTASK"} targetId={sel.id} pause={sel.pause} onChanged={(pz) => p.onPauseChanged(sel, pz)} />
          )}
        </div>
      </DetailContainer>
    );
  })();

  return (
    <RoleHub
      testId="houseman-hub"
      kpis={[
        { key: "total", label: t("houseman.tasks"), value: k.total, icon: "list" },
        { key: "done", label: t("hkHub.kpiDone"), value: k.done, icon: "check" },
        { key: "open", label: t("hkHub.kpiOpen"), value: k.open, icon: "circle", warm: false },
        { key: "waits", label: t("roleHub.afterDeparture"), value: k.waits, icon: "clock", warm: k.waits > 0 },
      ]}
      listTitle={t("houseman.tasks")}
      listIcon="bed-single"
      filters={counts.map((c) => ({ id: c.filter, label: t(HM_FILTER_LABEL[c.filter]), count: c.count }))}
      activeFilter={active}
      onFilter={(id) => setFilter(id as HmFilter)}
      extraFilters={
        p.floors.length > 1 ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:flex-wrap sm:px-6" role="group" aria-label={t("lists.floorN", { n: "" }).trim()}>
            {[null, ...p.floors].map((f) => (
              <FilterChip key={f ?? "all"} active={activeFloor === f} onClick={() => setFloor(f)}>
                {f === null ? t("lists.hmAllFloors") : t("lists.floorN", { n: f })}
              </FilterChip>
            ))}
          </div>
        ) : undefined
      }
      rows={visible.map((i) => ({
        key: i.key,
        icon: "bed-single",
        title: `${label(i)} · ${t("hkHub.earlyRooms", { rooms: i.roomNumber })}`,
        subtitle: subtitle(i) || undefined,
        pill: { label: t(hmPill(i).labelKey), tone: hmPill(i).tone },
        meta: meta(i),
        done: i.status === "DONE",
      }))}
      selectedKey={p.selectedKey}
      onSelect={(key) => p.onSelect(key)}
      detail={detail}
      detailOpen={!!sel}
      notices={p.notices}
      // Betrieb L2 (Punkt 9): wiederkehrende Aufgaben anlegen/verwalten
      below={<RecurringTasksPanel />}
      loading={p.loading}
      loadError={p.loadError}
      onRetry={p.onRetry}
      emptyText={p.items.length === 0 ? t("lists.hmNone") : t("hkHub.empty")}
      selectHint={t("roleHub.selectHint")}
    />
  );
}
