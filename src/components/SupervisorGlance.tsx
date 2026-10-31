"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import TodayAtAGlance, { type GlanceSource } from "@/components/TodayAtAGlance";
import DayNumberTiles from "@/components/DayNumberTiles";
import { GlanceDetailHost, GlanceTile, useGlanceDetail, type DetailContent } from "@/components/GlanceDetailSheet";
import type { DayNumberRow, DayNumbers } from "@/lib/dayplan/dayNumbers";
import { glanceKpis } from "@/lib/dayplan/glance";
import { floorBreakdown } from "@/lib/dayplan/glanceDetails";
import { useLocale } from "@/lib/i18n/LocaleContext";

type GlanceRoom = GlanceSource["rooms"][number] & { statusSince?: string };
interface Data { numbers: DayNumbers | null; rows?: DayNumberRow[]; mine: { floors: number[]; numbers: DayNumbers | null } | null }

/** Freigabe-Warteschlange als Kachel unter „Gesamtes Haus“ — die Aktionen kommen unverändert vom Live-Board. */
export interface ReleaseQueueProps {
  rooms: GlanceRoom[];
  backlog: boolean;
  busyRoomId: string | null;
  bulkBusy: boolean;
  onRelease: (roomId: string) => void;
  onRework: (roomId: string) => void;
  onReleaseAll: () => void;
}

/**
 * Supervisor-Startansicht „Heute auf einen Blick“: derselbe Aufbau wie beim Duty Manager (TodayAtAGlance), aber mit den Zahlen
 * der eigenen Etagen (`/api/day-numbers` → `mine`, dieselbe Zählung) und den Supervisor-Kacheln (Tagesfortschritt, DND/Blockiert).
 * Darunter die Kachel „Gesamtes Haus“ (Hauszahlen, antippbar → je Etage) und direkt darunter die Freigabe-Warteschlange.
 * Ohne zugeteilte Etagen: freundlicher Hinweis statt leerer oder falscher Zahlen. Duty Manager (auf dem Supervisor-Board)
 * sieht nur die Hauszahlen.
 */
export default function SupervisorGlance({ rooms, releaseQueue, onChanged }: { rooms: GlanceRoom[]; releaseQueue?: ReleaseQueueProps; onChanged?: () => void }) {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [orders, setOrders] = useState<GlanceSource["workOrders"]>([]);
  const [tasks, setTasks] = useState<GlanceSource["roomTasks"]>([]);
  const load = useCallback(async () => {
    const [n, w, rt] = await Promise.all([
      api<Data>("/api/day-numbers").catch(() => null),
      api<{ workOrders: { id: string; status: string; defect?: { category?: string; room?: { floor?: number; number?: string } } }[] }>("/api/workorders").catch(() => null),
      api<{ roomTasks: { id: string; status: string; type?: string; room?: { floor?: number; number?: string } }[] }>("/api/roomtasks").catch(() => null),
    ]);
    if (n) setData(n);
    if (w) setOrders((w.workOrders ?? []).map((x) => ({ id: x.id, status: x.status, floor: x.defect?.room?.floor, roomNumber: x.defect?.room?.number, category: x.defect?.category })));
    if (rt) setTasks((rt.roomTasks ?? []).map((x) => ({ id: x.id, status: x.status, floor: x.room?.floor, roomNumber: x.room?.number, type: x.type })));
  }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); }, 2000);
  useSocket({
    "room:update": () => soon(), "dayplan:updated": () => soon(), "assignments:applied": () => soon(),
    "workorder:update": () => soon(), "roomtask:update": () => soon(), "user:floors": () => soon(),
  });

  const floors = data?.mine?.floors ?? null;
  const ownFloors = floors && floors.length ? floors : null;
  const kpis = useMemo(() => glanceKpis({ rooms, workOrders: orders, roomTasks: tasks, floors: ownFloors }), [rooms, orders, tasks, ownFloors]);
  const source: GlanceSource = { rooms, rows: data?.rows ?? [], workOrders: orders, roomTasks: tasks, floors: ownFloors };
  const detail = useGlanceDetail<"house" | "queue">();
  if (!data) return null;

  const changed = () => { void load(); onChanged?.(); };
  const content: DetailContent | null = detail.key === "house" ? {
    title: t("glance.houseTitle"),
    header: data.numbers ? <DayNumberTiles className="mb-3" numbers={data.numbers} compact /> : undefined,
    sections: [{ items: floorBreakdown(data.rows ?? []).map((l) => ({ key: `f${l.floor}`, title: t("glance.floorLine", { floor: l.floor }), meta: t("glance.floorLineValue", { cleaned: l.cleaned, toClean: l.toClean, open: l.open }), tone: l.open > 0 ? "accent" as const : undefined })) }],
  } : detail.key === "queue" && releaseQueue ? {
    title: t("glance.releaseQueueTile"),
    header: releaseQueue.rooms.length > 1 ? (
      <button type="button" onClick={releaseQueue.onReleaseAll} disabled={releaseQueue.bulkBusy}
        className="mb-3 h-12 w-full rounded-xl bg-status-inspected text-sm font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50">
        {releaseQueue.bulkBusy ? t("supervisor.releasing") : t("supervisor.releaseAll", { count: releaseQueue.rooms.length })}
      </button>
    ) : undefined,
    sections: [{ empty: t("supervisor.nothingWaiting"), items: releaseQueue.rooms.map((r) => {
      const busy = releaseQueue.busyRoomId === r.id;
      return {
        key: r.id, title: r.number, roomRef: r.id,
        meta: [t("glance.floorShort", { n: r.floor }), r.assignedTo?.name, r.statusSince ? t("glance.waitingMin", { minutes: Math.max(0, Math.round((Date.now() - Date.parse(r.statusSince)) / 60000)) }) : ""].filter(Boolean).join(" · "),
        actions: (
          <>
            <button type="button" onClick={() => releaseQueue.onRelease(r.id)} disabled={busy}
              className="h-11 rounded-lg bg-status-inspected px-3 text-sm font-semibold text-linen disabled:opacity-50">{busy ? "…" : t("supervisor.inspectRelease")}</button>
            <button type="button" onClick={() => { detail.close(); releaseQueue.onRework(r.id); }} disabled={busy}
              className="h-11 rounded-lg border-2 border-status-pickup px-3 text-sm font-semibold text-status-pickup disabled:opacity-50">{t("supervisor.reworkBtn")}</button>
          </>
        ),
      };
    }) }],
  } : null;

  const houseAndQueue = (
    <div className="mt-3 space-y-3">
      {data.numbers && (
        <button type="button" onClick={() => detail.open("house")} aria-label={t("glance.houseTitle")}
          className="min-h-11 rounded-2xl text-left transition hover:brightness-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-graphite/55">{t("glance.houseTitle")} <span className="font-normal normal-case tracking-normal">· {t("glance.houseHint")} · {t("glance.houseTileHint")}</span></p>
          <DayNumberTiles numbers={data.numbers} compact />
        </button>
      )}
      {releaseQueue && (
        <GlanceTile label={t("glance.releaseQueueTile")} value={releaseQueue.rooms.length} sub={t("glance.releaseQueueSub")} accent={releaseQueue.backlog} onClick={() => detail.open("queue")} />
      )}
      <GlanceDetailHost state={detail} content={content} onChanged={changed} />
    </div>
  );

  // Duty Manager auf dem Supervisor-Board: kein Etagenbezug, nur das Haus
  if (!data.mine) {
    return (
      <TodayAtAGlance numbers={data.numbers} kpis={glanceKpis({ rooms, workOrders: orders, roomTasks: tasks })} source={{ ...source, floors: null }} variant="supervisor" onChanged={changed}>
        {releaseQueue && <div className="mt-3"><GlanceTile label={t("glance.releaseQueueTile")} value={releaseQueue.rooms.length} sub={t("glance.releaseQueueSub")} accent={releaseQueue.backlog} onClick={() => detail.open("queue")} /><GlanceDetailHost state={detail} content={content} onChanged={changed} /></div>}
      </TodayAtAGlance>
    );
  }
  if (!data.mine.floors.length) {
    return (
      <section className="mb-6" aria-label={t("dutyManager.dashboardTitle")}>
        <h3 className="mb-2 font-serif text-xl">{t("dutyManager.dashboardTitle")}</h3>
        <p role="status" className="rounded-xl border border-gold-line/60 bg-parchment p-3 text-sm">{t("glance.noFloors")}</p>
        {houseAndQueue}
      </section>
    );
  }
  return (
    <TodayAtAGlance title={t("glance.myFloorsTitle", { floors: data.mine.floors.join(", ") })} numbers={data.mine.numbers} kpis={kpis} source={source} variant="supervisor" onChanged={changed}>
      {houseAndQueue}
    </TodayAtAGlance>
  );
}
