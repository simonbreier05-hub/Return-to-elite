"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { usePersistedSet } from "@/components/usePersistedSet";
import LiveRoomModal from "./LiveRoomModal";
import RoomRowView, { type ListRoom } from "./RoomRowView";
import RowLegend from "./RowLegend";
import { hhmm } from "@/lib/i18n/format";
import { useGlassMode } from "@/components/shell/GlassMode";
import { Banner, Glyph, Pill, ProgressBar, RoomRow, RoomRowCompact, SectionLabel } from "@/components/ui";
import { useBreakpoint } from "@/components/shell/useBreakpoint";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import type { MarkerData } from "@/components/ui";
import { uiStatusForRoom } from "@/lib/ui/status";
import { kindPill, withoutLeadingSymbol } from "@/lib/ui/hkHub";
import type { RoomStatus } from "@/lib/domain";

type Group = "PROGRESS" | "DONE" | "OPEN" | "DND" | "ARRIVAL";
const GROUPS: Group[] = ["PROGRESS", "OPEN", "DND", "ARRIVAL", "DONE"];
const GROUP_KEY: Record<Group, TKey> = {
  PROGRESS: "lists.supGroupProgress", OPEN: "lists.supGroupOpen", DND: "lists.supGroupDnd", ARRIVAL: "lists.supGroupArrival", DONE: "lists.supGroupDone",
};
type SupRoom = ListRoom & { group: Group; changed: boolean };
interface Hk { id: string; name: string; dailyNumber: number | null; progress: { done: number; total: number; credits: number; creditsDone: number }; rooms: SupRoom[] }
interface Data {
  date: string | null; floors: number[]; noFloors: boolean; dataAsOf: string | null;
  housekeepers: Hk[]; unassigned: SupRoom[]; attendants: { id: string; name: string; dailyNumber: number | null }[];
}
const label = (a: { name: string; dailyNumber?: number | null }) => (a.dailyNumber ? `#${a.dailyNumber} ${a.name}` : a.name);
const num = (n: number) => n.toString().replace(".", ",");

/**
 * Supervisor-Liste (Etagenliste): je Housekeeper Fortschritt und Credits, aufklappbare Zimmerliste in Gruppen,
 * Traces aller Abteilungen, „durch Nachimport geändert", „Stand der Daten". Zimmer lassen sich über die
 * bestehende Verschieben-Funktion jederzeit manuell zuteilen. Nur die zugeteilten Etagen.
 */
export default function SupervisorList() {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [open, toggle] = usePersistedSet("stayclean.supList.open");
  const [roomRef, setRoomRef] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glass = useGlassMode();

  const load = useCallback(async () => { setData(await api<Data>("/api/lists/supervisor").catch(() => null)); }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(load, 1500);
  useSocket({
    "app:resync": () => soon(),
    "room:update": () => soon(),
    "work:pause": () => soon(),
    "assignments:applied": () => soon(),
    "trace:update": () => soon(),
    "note:new": () => soon(),
    "note:update": () => soon(),
    "dayplan:updated": (p: { changedRooms?: string[] }) => {
      soon();
      if (p?.changedRooms?.length) { setFlash(new Set(p.changedRooms)); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setFlash(new Set()), 3500); }
    },
  });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!data) return null;
  const mover = (_room: SupRoom, _fromId: string | null) => (
    <Link href="/floor-plan" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-gold-soft hover:underline">{t("roster.changeInFloorPlan")}</Link>
  );
  const roomItem = (room: SupRoom, fromId: string | null) => (
    <div key={room.id}>
      <ol><RoomRowView room={{ ...room, changed: room.changed || flash.has(room.number) }} highlight={flash.has(room.number)} showDept precheck onOpen={(r) => setRoomRef(r.id)} /></ol>
      {mover(room, fromId)}
    </div>
  );
  const stand = data.dataAsOf ? hhmm(data.dataAsOf) : null;
  if (glass) return <GlassSupervisorList data={data} open={open} toggle={toggle} flash={flash} stand={stand} error={error} roomRef={roomRef} setRoomRef={setRoomRef} reload={() => { void load(); }} />;

  return (
    <section aria-labelledby="sup-list-title" className="mb-6 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
      <h3 id="sup-list-title" className="font-serif text-2xl">{t("lists.supTitle")}</h3>
      <p className="mt-0.5 text-xs text-graphite/70">
        {!data.noFloors && <>{t("lists.supFloors", { list: data.floors.join(", ") })}</>}
        {stand && <> · {t("lists.stand", { time: stand })}</>} · {t("lists.live")}
      </p>
      <div className="mt-3"><RowLegend /></div>
      {data.noFloors ? (
        <p className="mt-3 rounded-lg border border-gold-line/50 bg-parchment p-3 text-sm">{t("lists.supNoFloors")}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {error && <p role="alert" className="rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 px-3 py-2 text-sm text-status-out-of-order">{error}</p>}
          {data.housekeepers.map((h) => {
            const isOpen = open.has(h.id);
            const pct = h.progress.total ? Math.round((h.progress.done / h.progress.total) * 100) : 0;
            return (
              <div key={h.id} className="rounded-xl border border-charcoal/10 bg-ivory">
                <button type="button" aria-expanded={isOpen} onClick={() => toggle(h.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-ivory">{h.dailyNumber ?? h.name.charAt(0)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{h.name}</span>
                    <span className="block text-xs text-graphite/70">{t("lists.progress", { done: h.progress.done, total: h.progress.total })} · {t("lists.credits", { done: num(h.progress.creditsDone), total: num(h.progress.credits) })}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-charcoal/10" aria-hidden><span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} /></span>
                  </span>
                  <span aria-hidden className="text-graphite/60">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-charcoal/10 px-3 py-3">
                    {GROUPS.map((g) => {
                      const rs = h.rooms.filter((r) => r.group === g);
                      if (!rs.length) return null;
                      return (
                        <div key={g}>
                          <h4 className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-graphite/70">{t(GROUP_KEY[g])} ({rs.length})</h4>
                          <div className="space-y-2">{rs.map((r) => roomItem(r, h.id))}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {data.unassigned.length > 0 && (
            <div className="rounded-xl border border-dashed border-charcoal/25 p-3">
              <h4 className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-graphite/70">{t("lists.supUnassigned")} ({data.unassigned.length})</h4>
              <div className="space-y-2">{data.unassigned.map((r) => roomItem(r, null))}</div>
            </div>
          )}
        </div>
      )}
      {roomRef && <LiveRoomModal roomRef={roomRef} onClose={() => setRoomRef(null)} onChanged={() => { void load(); }} />}
    </section>
  );
}

/**
 * Glas-Variante (D3b) der Supervisor-Liste: gleiche Daten, Gruppen und Wege (Zimmer öffnet `LiveRoomModal`,
 * Zuteilen nur über den Grundriss). Zimmer als `RoomRow`; was die Zeile nicht fasst (Prüfen, Traces, Wunsch,
 * Hinweis, Nachimport), steht als Pillen mit Text darunter.
 */
function GlassSupervisorList({ data, open, toggle, flash, stand, error, roomRef, setRoomRef, reload }: {
  data: Data; open: Set<string>; toggle: (id: string) => void; flash: Set<string>; stand: string | null; error: string | null;
  roomRef: string | null; setRoomRef: (id: string | null) => void; reload: () => void;
}) {
  const { t } = useLocale();
  const phone = useBreakpoint() === "phone";
  const row = (room: SupRoom) => {
    const pill = kindPill(room.kind);
    const markers: MarkerData[] = [];
    if (room.dnd) markers.push({ kind: "dnd", label: t("lists.dnd") });
    if ((room.defects ?? 0) > 0) markers.push({ kind: "defect", label: t("lists.rowDefects", { n: room.defects ?? 0 }) });
    if (room.vip) markers.push({ kind: "vip", label: t("lists.vip") });
    if (room.laundry) markers.push({ kind: "laundry", label: t("lists.laundry") });
    const status = uiStatusForRoom(room.status as RoomStatus, { paused: !!room.pause });
    const traces = Array.isArray(room.traces) ? room.traces : [];
    const extra: { label: string; tone: "accent" | "info" | "success" | "warning" | "neutral" }[] = [];
    if (room.kind === "ARRIVAL") extra.push(room.status === "INSPECTED" ? { label: t("lists.arrivalReleased"), tone: "success" } : { label: t("lists.precheckArrival"), tone: "accent" });
    if (room.kind === "DEPARTURE") extra.push({ label: t("lists.precheckNoted"), tone: "neutral" });
    if (traces.length) extra.push({ label: t("lists.rowTraces", { n: traces.length }), tone: "info" });
    if (room.wish) extra.push({ label: t(`lists.wish${room.wish}` as TKey), tone: "warning" });
    if ((room.hints?.length ?? 0) > 0) extra.push({ label: t("lists.hint"), tone: "info" });
    if (room.changed || flash.has(room.number)) extra.push({ label: t("lists.changed"), tone: "accent" });
    if (phone) for (const m of markers.slice(1)) extra.push({ label: m.label, tone: "neutral" });
    if (room.credits > 0) extra.push({ label: t("lists.creditsN", { n: room.credits.toString().replace(".", ",") }), tone: "neutral" });
    return (
      <li key={room.id} data-room={room.number} className={cx("rounded-(--glass-radius-sm)", flash.has(room.number) && "bg-surface-selected")}>
        {phone ? (
          // Handy: kompakte Zeile (Status als Symbol mit Vorlesetext, ein Marker); weitere Marker stehen unten als Pillen
          <RoomRowCompact
            room={room.number}
            guest={room.guest ?? undefined}
            pill={pill ? { label: t(pill.labelKey), tone: pill.tone } : undefined}
            status={{ value: status, label: t(`status.${room.status}` as TKey) }}
            marker={markers[0]}
            onClick={() => setRoomRef(room.id)}
            aria-label={t("lists.hmOpenRoom", { n: room.number })}
          />
        ) : (
          <RoomRow
            room={room.number}
            guest={room.guest ?? undefined}
            pill={pill ? { label: t(pill.labelKey), tone: pill.tone } : undefined}
            status={{ value: status, label: t(`status.${room.status}` as TKey) }}
            markers={markers}
            onClick={() => setRoomRef(room.id)}
            aria-label={t("lists.hmOpenRoom", { n: room.number })}
          />
        )}
        {extra.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {extra.map((x) => <Pill key={x.label} tone={x.tone}>{withoutLeadingSymbol(x.label)}</Pill>)}
          </div>
        )}
      </li>
    );
  };
  return (
    <section aria-labelledby="sup-list-title" className="glass flex flex-col gap-4 rounded-(--glass-radius-lg) p-4 sm:p-6">
      <div>
        <h2 id="sup-list-title" className="text-title-22 text-text-primary">{t("lists.supTitle")}</h2>
        <p className="text-label text-text-muted">
          {!data.noFloors && <>{t("lists.supFloors", { list: data.floors.join(", ") })}</>}
          {stand && <> · {t("lists.stand", { time: stand })}</>} · {t("lists.live")}
        </p>
      </div>
      {data.noFloors ? (
        <Banner tone="info" title={t("lists.supNoFloors")} />
      ) : (
        <div className="flex flex-col gap-3">
          {error && <div role="alert"><Banner tone="warning" title={error} /></div>}
          {data.housekeepers.map((h) => {
            const isOpen = open.has(h.id);
            const progress = t("lists.progress", { done: h.progress.done, total: h.progress.total });
            return (
              <div key={h.id} className="rounded-(--glass-radius-md) bg-surface-card-raised">
                <button type="button" aria-expanded={isOpen} onClick={() => toggle(h.id)}
                  className={cx("press flex min-h-16 w-full items-center gap-4 px-4 py-3 text-start", FOCUS_RING)}>
                  <span className="bg-champagne text-body-18 flex size-10 shrink-0 items-center justify-center rounded-pill text-text-on-accent">{h.dailyNumber ?? h.name.charAt(0)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-body-18 truncate text-text-primary">{h.name}</span>
                    <span className="text-label text-text-muted">{progress} · {t("lists.credits", { done: num(h.progress.creditsDone), total: num(h.progress.credits) })}</span>
                    <ProgressBar value={h.progress.done} max={h.progress.total} label={progress} />
                  </span>
                  <Glyph name="chevron-down" size={22} className={cx("text-text-secondary transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-border-subtle px-2 py-3">
                    {GROUPS.map((g) => {
                      const rs = h.rooms.filter((r) => r.group === g);
                      if (!rs.length) return null;
                      return (
                        <div key={g} className="flex flex-col gap-1">
                          <SectionLabel as="h3" title={t(GROUP_KEY[g])} count={rs.length} className="px-2" />
                          <ul className="flex flex-col">{rs.map(row)}</ul>
                        </div>
                      );
                    })}
                    <Link href="/floor-plan" className={cx("text-body-16 inline-flex min-h-(--size-touch-min) items-center px-2 text-accent-text underline underline-offset-4", FOCUS_RING)}>{t("roster.changeInFloorPlan")}</Link>
                  </div>
                )}
              </div>
            );
          })}
          {data.unassigned.length > 0 && (
            <div className="flex flex-col gap-1 rounded-(--glass-radius-md) border border-dashed border-border-default p-2">
              <SectionLabel as="h3" title={t("lists.supUnassigned")} count={data.unassigned.length} className="px-2 pt-2" />
              <ul className="flex flex-col">{data.unassigned.map(row)}</ul>
              <Link href="/floor-plan" className={cx("text-body-16 inline-flex min-h-(--size-touch-min) items-center px-2 text-accent-text underline underline-offset-4", FOCUS_RING)}>{t("roster.changeInFloorPlan")}</Link>
            </div>
          )}
        </div>
      )}
      {roomRef && <LiveRoomModal roomRef={roomRef} onClose={() => setRoomRef(null)} onChanged={reload} />}
    </section>
  );
}
