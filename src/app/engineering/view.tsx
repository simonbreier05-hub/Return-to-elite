"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import PriorityBanner from "@/components/PriorityBanner";
import RoomDetailModal from "@/components/RoomDetailModal";
import { useRoomLookup } from "@/components/useRoomLookup";
import { EngineeringHub } from "@/components/roles/EngineeringHub";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { mergeWorkOrder, NEXT_STEP, normalizeWorkOrder, type WorkOrderView } from "@/lib/ui/engineeringHub";

/**
 * Techniker (`/engineering`): Daten und Aktionen — Darstellung in `src/components/roles/EngineeringHub.tsx`.
 * Gleiche Wege wie bisher: `GET /api/workorders`, `PATCH /api/workorders/[id]` (OPEN → ACK → IN_PROGRESS → RESOLVED),
 * Live `workorder:update` / `work:pause`, Pause über `POST /api/work/pause`, Nachrichten über `RoomNote`.
 */
export default function EngineeringView() {
  const { t } = useLocale();
  const [orders, setOrders] = useState<WorkOrderView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const roomLookup = useRoomLookup();

  const load = useCallback(async () => {
    try {
      const data = await api<{ workOrders?: unknown[] }>("/api/workorders");
      const list = Array.isArray(data?.workOrders) ? data.workOrders : [];
      setOrders(list.map(normalizeWorkOrder).filter((x): x is WorkOrderView => !!x));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e, t));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Betroffenen Auftrag aktualisieren; ein neuer kommt nach vorn. Unvollständige Ereignisse ändern nur, was dabei ist. */
  const upsert = (raw: unknown) =>
    setOrders((prev) => {
      const list = prev ?? [];
      const id = normalizeWorkOrder(raw)?.id;
      if (!id) return prev;
      if (list.some((o) => o.id === id)) return list.map((o) => (o.id === id ? mergeWorkOrder(o, raw) : o));
      const fresh = normalizeWorkOrder(raw);
      return fresh ? [fresh, ...list] : list;
    });

  useSocket({
    "app:resync": () => void load(),
    "workorder:update": (p: { workOrder?: unknown } | undefined) => {
      if (p?.workOrder) upsert(p.workOrder);
    },
    "work:pause": (p: { targetType?: string } | undefined) => {
      if (!p || p.targetType === "WORKORDER") void load();
    },
  });

  const advance = async (wo: WorkOrderView) => {
    const next = NEXT_STEP[wo.status];
    if (!next || busyId) return;
    setBusyId(wo.id);
    setError(null);
    try {
      const res = await api<{ workOrder?: unknown }>(`/api/workorders/${wo.id}`, { method: "PATCH", body: { status: next.to } });
      if (res?.workOrder) upsert(res.workOrder);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusyId(null);
    }
  };

  const list = orders ?? [];
  const openUnacked = list.filter((o) => o.status === "OPEN").length;
  const ackNotStarted = list.filter((o) => o.status === "ACK").length;

  return (
    <>
      <EngineeringHub
        orders={list}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setError(null);
        }}
        onAdvance={advance}
        busyId={busyId}
        actionError={error}
        loading={orders === null && !loadError}
        loadError={orders === null ? loadError : null}
        onRetry={() => void load()}
        onPauseChanged={(id, pause) => setOrders((prev) => prev && prev.map((o) => (o.id === id ? { ...o, pause: pause ? { reason: pause.reason, since: pause.since, byName: pause.byName } : null } : o)))}
        onOpenRoom={(n) => roomLookup.open(n)}
        notices={
          <PriorityBanner
            items={[
              { count: openUnacked, label: t("priority.openWorkOrders"), icon: "warning", tone: "urgent" },
              { count: ackNotStarted, label: t("priority.ackWorkOrders"), icon: "clock", tone: "watch" },
            ]}
          />
        }
      />
      {roomLookup.room && <RoomDetailModal room={roomLookup.room} onClose={roomLookup.close} />}
    </>
  );
}
