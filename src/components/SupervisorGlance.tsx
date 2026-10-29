"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import TodayAtAGlance from "@/components/TodayAtAGlance";
import DayNumberTiles from "@/components/DayNumberTiles";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";
import { glanceKpis } from "@/lib/dayplan/glance";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface GlanceRoom { floor: number; isCheckoutToday: boolean; status: string; blockReason?: string | null; arrivals?: unknown[] | null }
interface Data { numbers: DayNumbers | null; mine: { floors: number[]; numbers: DayNumbers | null } | null }

/**
 * Supervisor-Startansicht „Heute auf einen Blick“: derselbe Aufbau wie beim Duty Manager (TodayAtAGlance), aber mit den Zahlen
 * der eigenen Etagen (`/api/day-numbers` → `mine`, dieselbe Zählung). Darunter klein und abgesetzt die Hauszahlen als
 * Orientierung. Ohne zugeteilte Etagen: freundlicher Hinweis statt leerer oder falscher Zahlen. Duty Manager (auf dem
 * Supervisor-Board) sieht nur die Hauszahlen.
 */
export default function SupervisorGlance({ rooms }: { rooms: GlanceRoom[] }) {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [orders, setOrders] = useState<{ status: string; floor?: number }[]>([]);
  const [tasks, setTasks] = useState<{ status: string; floor?: number }[]>([]);
  const load = useCallback(async () => {
    const [n, w, rt] = await Promise.all([
      api<Data>("/api/day-numbers").catch(() => null),
      api<{ workOrders: { status: string; defect?: { room?: { floor?: number } } }[] }>("/api/workorders").catch(() => null),
      api<{ roomTasks: { status: string; room?: { floor?: number } }[] }>("/api/roomtasks").catch(() => null),
    ]);
    if (n) setData(n);
    if (w) setOrders((w.workOrders ?? []).map((x) => ({ status: x.status, floor: x.defect?.room?.floor })));
    if (rt) setTasks((rt.roomTasks ?? []).map((x) => ({ status: x.status, floor: x.room?.floor })));
  }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); }, 2000);
  useSocket({
    "room:update": () => soon(), "dayplan:updated": () => soon(), "assignments:applied": () => soon(),
    "workorder:update": () => soon(), "roomtask:update": () => soon(), "user:floors": () => soon(),
  });

  const floors = data?.mine?.floors ?? null;
  const kpis = useMemo(() => glanceKpis({ rooms, workOrders: orders, roomTasks: tasks, floors: floors && floors.length ? floors : null }), [rooms, orders, tasks, floors]);
  if (!data) return null;

  const house = data.numbers && (
    <div className="mt-3" aria-label={t("glance.houseTitle")}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-graphite/55">{t("glance.houseTitle")} <span className="font-normal normal-case tracking-normal">· {t("glance.houseHint")}</span></p>
      <DayNumberTiles numbers={data.numbers} compact />
    </div>
  );

  // Duty Manager auf dem Supervisor-Board: kein Etagenbezug, nur das Haus
  if (!data.mine) return <TodayAtAGlance numbers={data.numbers} kpis={glanceKpis({ rooms, workOrders: orders, roomTasks: tasks })} />;
  if (!data.mine.floors.length) {
    return (
      <section className="mb-6" aria-label={t("dutyManager.dashboardTitle")}>
        <h3 className="mb-2 font-serif text-xl">{t("dutyManager.dashboardTitle")}</h3>
        <p role="status" className="rounded-xl border border-gold-line/60 bg-parchment p-3 text-sm">{t("glance.noFloors")}</p>
        {house}
      </section>
    );
  }
  return (
    <TodayAtAGlance title={t("glance.myFloorsTitle", { floors: data.mine.floors.join(", ") })} numbers={data.mine.numbers} kpis={kpis}>
      {house}
    </TodayAtAGlance>
  );
}
