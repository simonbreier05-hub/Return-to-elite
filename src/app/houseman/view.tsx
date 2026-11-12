"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useHousemanList } from "@/components/lists/HousemanList";
import { HousemanHub } from "@/components/roles/HousemanHub";
import { Banner } from "@/components/ui";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { mergeHousemanItems, type HmItemView } from "@/lib/ui/housemanHub";

/**
 * Hausmann (`/houseman`): Daten und Aktionen — Darstellung in `src/components/roles/HousemanHub.tsx`.
 * Hausmann-Liste (Traces) über `useHousemanList` (gleiche Logik wie die alte Liste), von Hand angelegte Aufgaben über
 * `GET/PATCH /api/roomtasks` — Aufgaben, die schon als Trace-Zeile erscheinen, nicht doppelt.
 */
export default function HousemanView() {
  const { t, intl } = useLocale();
  const hm = useHousemanList();
  const [tasks, setTasks] = useState<unknown[] | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const data = await api<{ roomTasks?: unknown[] }>("/api/roomtasks");
      setTasks(Array.isArray(data?.roomTasks) ? data.roomTasks : []);
      setTaskError(null);
    } catch (e) {
      setTaskError(errorText(e, t));
    }
  }, [t]);
  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useSocket({
    "app:resync": () => void loadTasks(),
    "roomtask:update": (p: { roomTask?: { id?: string; status?: string } } | undefined) => {
      const rt = p?.roomTask;
      if (!rt?.id) return;
      setTasks((prev) => {
        const list = prev ?? [];
        const has = list.some((x) => (x as { id?: string })?.id === rt.id);
        return has
          ? list.map((x) => ((x as { id?: string })?.id === rt.id ? { ...(x as object), ...rt, ...(rt.status === "DONE" ? { pause: null } : {}) } : x))
          : [rt, ...list];
      });
    },
    "work:pause": (p: { targetType?: string } | undefined) => {
      if (!p || p.targetType === "ROOMTASK") void loadTasks();
    },
  });

  const traceItems = useMemo(() => (Array.isArray(hm.data?.items) ? hm.data!.items : []), [hm.data]);
  const items = useMemo(() => mergeHousemanItems(traceItems, tasks ?? []), [traceItems, tasks]);

  const toggle = async (item: HmItemView) => {
    if (busyKey) return;
    setError(null);
    if (item.kind === "trace") {
      setBusyKey(item.key);
      await hm.toggle({ id: item.id, status: item.status });
      setBusyKey(null);
      return;
    }
    if (item.status !== "OPEN") return;
    setBusyKey(item.key);
    try {
      const res = await api<{ roomTask?: unknown }>(`/api/roomtasks/${item.id}`, { method: "PATCH", body: { status: "DONE" } });
      const rt = res?.roomTask as { id?: string } | undefined;
      if (rt?.id) setTasks((prev) => (prev ?? []).map((x) => ((x as { id?: string })?.id === rt.id ? rt : x)));
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusyKey(null);
    }
  };

  const loading = (hm.data === null && !hm.loadError) || (tasks === null && !taskError);
  const loadError = hm.data === null && hm.loadError ? t("roleHub.loadError") : tasks === null ? taskError : null;
  const hub = hm.data?.hub;

  return (
    <HousemanHub
      items={items}
      floors={Array.isArray(hm.data?.floors) ? hm.data!.floors : []}
      selectedKey={selectedKey}
      onSelect={(k) => {
        setSelectedKey(k);
        setError(null);
      }}
      onToggle={toggle}
      busyKey={busyKey}
      actionError={error ?? hm.error}
      loading={loading && !loadError}
      loadError={loadError}
      onRetry={() => {
        void hm.load();
        void loadTasks();
      }}
      onPauseChanged={(item, pause) => {
        if (item.kind === "trace") hm.setPause(item.id, pause);
        else setTasks((prev) => (prev ?? []).map((x) => ((x as { id?: string })?.id === item.id ? { ...(x as object), pause } : x)));
      }}
      notices={
        hub && !hub.ready ? (
          <Banner
            tone="info"
            icon="calendar-days"
            title={t("hubDay.missingTitle", { date: new Date(`${hub.date}T12:00:00Z`).toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) })}
            detail={t("hubDay.missingAttendant")}
          />
        ) : undefined
      }
    />
  );
}
