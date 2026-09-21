"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import WindowPanel from "@/components/WindowPanel";
import RoomTaskModal from "@/components/RoomTaskModal";
import { FLOORS, type RoomStatus, type RoomTaskType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

interface Room {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  blockReason?: string | null;
  isCheckoutToday: boolean;
  arrivals: { guestName: string }[];
}

interface WorkOrder {
  id: string;
  status: string;
}

interface RoomTask {
  id: string;
  type: RoomTaskType;
  note?: string | null;
  status: "OPEN" | "DONE";
  createdAt: string;
  room: { number: string; floor: number };
  createdBy: { name: string };
}

interface Supervisor {
  id: string;
  name: string;
  email: string;
  assignedFloors: number[];
}

/**
 * Duty-manager screen: a "watching over the house" role — today's key
 * numbers at a glance, which supervisor covers which floor(s), one-click
 * access to the existing morning-planning page, and the ability to hand the
 * houseman a task directly. Deliberately does not duplicate the
 * supervisor's live room board or the planning logic itself — see the
 * duty-manager-screen prompt for why those stay separate screens.
 */
export default function DutyManagerView() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [roomTasks, setRoomTasks] = useState<RoomTask[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [roomsData, workOrdersData, roomTasksData, supervisorsData] = await Promise.all([
      api<{ rooms: Room[] }>("/api/rooms"),
      api<{ workOrders: WorkOrder[] }>("/api/workorders"),
      api<{ roomTasks: RoomTask[] }>("/api/roomtasks"),
      api<{ supervisors: Supervisor[] }>("/api/users/supervisors"),
    ]);
    setRooms(roomsData.rooms);
    setWorkOrders(workOrdersData.workOrders);
    setRoomTasks(roomTasksData.roomTasks);
    setSupervisors(supervisorsData.supervisors);
  }, []);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const refetchSoon = useCoalescedRefetch(() => load().catch(() => {}), 2000);

  useSocket({
    "room:update": () => refetchSoon(),
    "arrival:update": () => refetchSoon(),
    "assignments:applied": () => refetchSoon(),
    "workorder:update": () => refetchSoon(),
    "roomtask:update": (p: { roomTask: RoomTask }) => {
      const task = p?.roomTask;
      if (!task?.id) return;
      setRoomTasks((prev) => (prev.some((x) => x.id === task.id) ? prev.map((x) => (x.id === task.id ? task : x)) : [task, ...prev]));
    },
    "user:floors": () => refetchSoon(),
  });

  // --- Aufgabe C: today's key numbers, all derived from the same three
  // endpoints the rest of the app already uses — no new server aggregation.
  const arrivalsToday = useMemo(() => rooms.reduce((n, r) => n + r.arrivals.length, 0), [rooms]);
  const departuresToday = useMemo(() => rooms.filter((r) => r.isCheckoutToday).length, [rooms]);
  const dndRooms = useMemo(() => rooms.filter((r) => r.status === "BLOCKED" && r.blockReason === "DND").length, [rooms]);
  const openDefects = useMemo(() => workOrders.filter((wo) => wo.status !== "RESOLVED").length, [workOrders]);
  const openHouseTasks = useMemo(() => roomTasks.filter((rt) => rt.status === "OPEN").length, [roomTasks]);
  const assignedFloorSet = useMemo(() => new Set(supervisors.flatMap((s) => s.assignedFloors)), [supervisors]);
  const unassignedFloors = useMemo(() => FLOORS.filter((f) => !assignedFloorSet.has(f)), [assignedFloorSet]);

  // --- Aufgabe A: floor assignment — per-supervisor draft state, saved
  // individually so a duty manager can adjust one supervisor's floors
  // without touching the others' unsaved edits.
  const [drafts, setDrafts] = useState<Record<string, number[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of supervisors) if (!(s.id in next)) next[s.id] = s.assignedFloors;
      return next;
    });
  }, [supervisors]);

  const toggleFloor = (supervisorId: string, floor: number) => {
    setDrafts((prev) => {
      const current = prev[supervisorId] ?? [];
      const next = current.includes(floor) ? current.filter((f) => f !== floor) : [...current, floor];
      return { ...prev, [supervisorId]: next };
    });
  };

  const saveFloors = async (supervisorId: string) => {
    setSavingId(supervisorId);
    setError(null);
    try {
      const res = await api<{ user: Supervisor }>(`/api/users/${supervisorId}/floors`, {
        method: "PATCH",
        body: { floors: drafts[supervisorId] ?? [] },
      });
      setSupervisors((prev) => prev.map((s) => (s.id === supervisorId ? { ...s, assignedFloors: res.user.assignedFloors } : s)));
      setSavedId(supervisorId);
      setTimeout(() => setSavedId((id) => (id === supervisorId ? null : id)), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  // Committed (persisted) coverage — the "who has which floor" list reflects
  // what is actually saved, not an unsaved draft still being edited.
  const coverageByFloor = useMemo(() => {
    const map = new Map<number, Supervisor[]>();
    for (const f of FLOORS) map.set(f, []);
    for (const s of supervisors) {
      for (const f of s.assignedFloors) map.get(f)?.push(s);
    }
    return map;
  }, [supervisors]);

  // --- Aufgabe D: hand the houseman a task directly, via the same shared
  // RoomTaskModal the supervisor board uses.
  const [pickedNumber, setPickedNumber] = useState("");
  const [taskRoom, setTaskRoom] = useState<Room | null>(null);

  const openTasks = useMemo(() => roomTasks.filter((rt) => rt.status === "OPEN"), [roomTasks]);
  const doneTasks = useMemo(() => roomTasks.filter((rt) => rt.status === "DONE").slice(0, 10), [roomTasks]);

  const pickRoom = () => {
    const match = rooms.find((r) => r.number === pickedNumber.trim());
    if (!match) {
      setError(t("dutyManager.unknownRoom"));
      return;
    }
    setError(null);
    setTaskRoom(match);
  };

  const roomTaskLabel = (task: RoomTask) =>
    task.type === "SONSTIGES"
      ? `${task.room.number} — ${task.note ?? t("roomTaskType.SONSTIGES")}`
      : `${task.room.number} — ${t(`roomTaskType.${task.type}` as TKey)}`;

  return (
    <div className="animate-rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">{t("dutyManager.title")}</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">{t("dutyManager.subtitle")}</p>
        </div>
        <Link
          href="/supervisor/planning"
          className="flex h-14 items-center rounded-xl bg-navy px-6 text-sm font-semibold tracking-wide text-ivory transition hover:bg-navy-line"
        >
          {t("dutyManager.planningLink")}
        </Link>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 px-4 py-2 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      <h3 className="mb-2 font-serif text-xl">{t("dutyManager.dashboardTitle")}</h3>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t("dutyManager.arrivalsToday")} value={String(arrivalsToday)} />
        <Kpi label={t("dutyManager.departuresToday")} value={String(departuresToday)} />
        <Kpi label={t("dutyManager.dndRooms")} value={String(dndRooms)} accent={dndRooms > 0} />
        <Kpi label={t("dutyManager.openDefects")} value={String(openDefects)} accent={openDefects > 0} />
        <Kpi label={t("dutyManager.openHouseTasks")} value={String(openHouseTasks)} accent={openHouseTasks > 0} />
        <Kpi label={t("dutyManager.unassignedFloorsKpi")} value={String(unassignedFloors.length)} accent={unassignedFloors.length > 0} />
      </div>

      <WindowPanel title={t("dutyManager.floorAssignmentTitle")}>
        <p className="mb-4 text-sm text-graphite/70">{t("dutyManager.floorAssignmentHint")}</p>

        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite/60">
          {t("dutyManager.coverageTitle")}
        </h4>
        <div className="mb-5 flex flex-wrap gap-2">
          {FLOORS.map((floor) => {
            const covering = coverageByFloor.get(floor) ?? [];
            return (
              <span
                key={floor}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  covering.length === 0 ? "border-status-out-of-order/40 bg-status-out-of-order/10 text-status-out-of-order" : "border-charcoal/10 bg-white"
                }`}
              >
                {t("dutyManager.floorShort", { floor })}:{" "}
                {covering.length > 0 ? covering.map((s) => s.name).join(", ") : t("dutyManager.floorUnassigned")}
              </span>
            );
          })}
        </div>

        {supervisors.length === 0 ? (
          <p className="text-sm text-graphite/60">{t("dutyManager.noSupervisors")}</p>
        ) : (
          <div className="space-y-3">
            {supervisors.map((s) => {
              const draft = drafts[s.id] ?? [];
              const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...s.assignedFloors].sort());
              return (
                <div key={s.id} className="rounded-xl border border-charcoal/10 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-graphite/60">{s.email}</p>
                    </div>
                    {savedId === s.id && <span className="text-xs text-status-inspected">{t("dutyManager.floorsSaved")}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {FLOORS.map((floor) => (
                      <button
                        key={floor}
                        onClick={() => toggleFloor(s.id, floor)}
                        className={`h-10 rounded-lg border px-3 text-sm font-medium ${
                          draft.includes(floor) ? "border-gold bg-parchment font-semibold" : "border-charcoal/20"
                        }`}
                      >
                        {floor}
                      </button>
                    ))}
                    <button
                      onClick={() => saveFloors(s.id)}
                      disabled={savingId === s.id || !dirty}
                      className="ml-2 h-10 rounded-lg bg-navy px-4 text-sm font-semibold text-ivory disabled:opacity-40"
                    >
                      {savingId === s.id ? t("common.saving") : t("dutyManager.saveFloors")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WindowPanel>

      <WindowPanel title={t("dutyManager.houseTasksTitle")} right={<span className="text-xs text-graphite/60">{openTasks.length}</span>}>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-graphite/60">
              {t("dutyManager.pickRoomLabel")}
            </label>
            <input
              value={pickedNumber}
              onChange={(e) => setPickedNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pickRoom()}
              list="duty-manager-room-numbers"
              placeholder={t("dutyManager.pickRoomPlaceholder")}
              className="h-12 w-40 rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold"
            />
            <datalist id="duty-manager-room-numbers">
              {rooms.map((r) => (
                <option key={r.id} value={r.number} />
              ))}
            </datalist>
          </div>
          <button
            onClick={pickRoom}
            disabled={!pickedNumber.trim()}
            className="h-12 rounded-lg bg-navy px-4 text-sm font-semibold text-ivory disabled:opacity-40"
          >
            {t("dutyManager.createTaskBtn")}
          </button>
          <p className="text-xs text-graphite/60">{t("dutyManager.pickRoomHint")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite/60">
              {t("dutyManager.openTasksLabel")}
            </h4>
            {openTasks.length === 0 ? (
              <p className="text-sm text-graphite/60">{t("dutyManager.noOpenTasks")}</p>
            ) : (
              <ul className="space-y-1.5">
                {openTasks.map((task) => (
                  <li key={task.id} className="rounded-lg border border-charcoal/10 bg-ivory px-3 py-2 text-sm">
                    {roomTaskLabel(task)}
                    <span className="ml-1 text-xs text-graphite/50">
                      · {new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite/60">
              {t("dutyManager.doneTasksLabel")}
            </h4>
            {doneTasks.length === 0 ? (
              <p className="text-sm text-graphite/60">{t("dutyManager.noDoneTasks")}</p>
            ) : (
              <ul className="space-y-1.5">
                {doneTasks.map((task) => (
                  <li key={task.id} className="rounded-lg border border-charcoal/10 bg-linen/60 px-3 py-2 text-sm text-graphite/70 line-through decoration-charcoal/30">
                    {roomTaskLabel(task)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </WindowPanel>

      {taskRoom && (
        <RoomTaskModal
          room={taskRoom}
          onClose={() => setTaskRoom(null)}
          onSubmit={async (payload) => {
            try {
              await api("/api/roomtasks", { body: { roomId: taskRoom.id, ...payload } });
              setTaskRoom(null);
              setPickedNumber("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-gold/40 bg-gold/10" : "border-charcoal/10 bg-white"}`}>
      <div className="text-xs uppercase tracking-wider text-graphite/60">{label}</div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
    </div>
  );
}
