"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

interface RoomTask {
  id: string;
  type: "TWIN_SETUP" | "TWIN_REVERT" | "SONSTIGES";
  note?: string | null;
  status: "OPEN" | "DONE";
  createdAt: string;
  room: { number: string; floor: number };
  createdBy: { name: string };
}

/**
 * The houseman's whole screen: a flat list of open furniture/bed-config
 * jobs, "Erledigt" to close one out. Deliberately minimal — no cleaning
 * status, no note threads, no room modal — see prompt Aufgabe B: the
 * houseman does a different job than housekeeping and doesn't need its UI.
 */
export default function HousemanView() {
  const { t } = useLocale();
  const [tasks, setTasks] = useState<RoomTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ roomTasks: RoomTask[] }>("/api/roomtasks");
    setTasks(data.roomTasks);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upsert = (task: RoomTask) =>
    setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev.map((x) => (x.id === task.id ? task : x)) : [task, ...prev]));

  useSocket({
    "roomtask:update": (p: { roomTask: RoomTask }) => {
      if (p.roomTask?.id) upsert(p.roomTask);
    },
  });

  const complete = async (task: RoomTask) => {
    if (busyId) return;
    setBusyId(task.id);
    setError(null);
    try {
      const res = await api<{ roomTask: RoomTask }>(`/api/roomtasks/${task.id}`, {
        method: "PATCH",
        body: { status: "DONE" },
      });
      upsert(res.roomTask);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const open = tasks.filter((t) => t.status === "OPEN");

  const taskLabel = (task: RoomTask) =>
    task.type === "SONSTIGES"
      ? `${t("houseman.room")} ${task.room.number} — ${task.note ?? t("roomTaskType.SONSTIGES")}`
      : `${t("houseman.room")} ${task.room.number} — ${t(`roomTaskType.${task.type}` as TKey)}`;

  return (
    <div>
      <h2 className="mb-1 font-serif text-3xl">{t("houseman.tasks")}</h2>
      <p className="mb-4 text-sm text-graphite/70">{t("houseman.openCount", { count: open.length })}</p>

      {error && (
        <div className="mb-4 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 p-3 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      {open.length === 0 ? (
        <p className="rounded-2xl border border-charcoal/10 bg-linen p-8 text-center text-graphite/60 shadow-card">
          {t("houseman.noTasks")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {open.map((task) => (
            <div key={task.id} className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
              <p className="font-serif text-2xl">{taskLabel(task)}</p>
              <p className="mt-1 text-xs text-graphite/60">
                {t("houseman.requestedBy", { name: task.createdBy.name })} ·{" "}
                {new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              <button
                onClick={() => complete(task)}
                disabled={busyId === task.id}
                className="mt-3 h-12 w-full rounded-xl bg-status-inspected text-base font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50"
              >
                {busyId === task.id ? "…" : t("houseman.markDone")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
