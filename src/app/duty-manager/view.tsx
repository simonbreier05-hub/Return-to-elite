"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HubMoreMenu from "@/components/HubMoreMenu";
import Link from "next/link";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import WindowPanel from "@/components/WindowPanel";
import LiveListsPanel from "@/components/lists/LiveListsPanel";
import RoomTaskModal from "@/components/RoomTaskModal";
import TodayAtAGlance from "@/components/TodayAtAGlance";
import { glanceKpis } from "@/lib/dayplan/glance";
import type { DayNumberRow, DayNumbers } from "@/lib/dayplan/dayNumbers";
import ErrorBoundary from "@/components/ErrorBoundary";
import { FLOORS, type RoomStatus, type RoomTaskType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";

interface Room {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  occupancy: string;
  blockReason?: string | null;
  isCheckoutToday: boolean;
  arrivals: { guestName: string }[];
  assignedTo?: { id: string; name: string } | null;
  guestDndActive?: boolean;
}

interface WorkOrder {
  id: string;
  status: string;
  defect?: { category?: string; room?: { floor?: number; number?: string } };
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
  assignedFloors: number[];
}

/**
 * Duty-manager screen: a "watching over the house" role — today's key
 * numbers at a glance, one-click access to the planning tool, the live
 * lists, and the ability to hand the houseman a task directly. Floors are
 * assigned to supervisors and housekeepers in the Tagesplanung (/planung),
 * not here; the "floors without a supervisor" number stays as a warning.
 */
export default function DutyManagerView() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [roomTasks, setRoomTasks] = useState<RoomTask[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hub, setHub] = useState<HubState | null>(null);
  const [numbers, setNumbers] = useState<DayNumbers | null>(null);
  const [dayRows, setDayRows] = useState<DayNumberRow[]>([]);

  const load = useCallback(async () => {
    const [roomsData, workOrdersData, roomTasksData, supervisorsData, numbersData] = await Promise.all([
      api<{ rooms: Room[]; hub?: HubState }>("/api/rooms"),
      api<{ workOrders: WorkOrder[] }>("/api/workorders"),
      api<{ roomTasks: RoomTask[] }>("/api/roomtasks"),
      api<{ supervisors: Supervisor[] }>("/api/users/supervisors"),
      api<{ numbers: DayNumbers | null; rows?: DayNumberRow[] }>("/api/day-numbers"),
    ]);
    setNumbers(numbersData.numbers);
    setDayRows(numbersData.rows ?? []);
    setRooms(roomsData.rooms);
    setHub(roomsData.hub ?? null);
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
    "dayplan:updated": () => refetchSoon(),
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

  // --- Aufgabe C: today's key numbers, all derived from the same
  // endpoints the rest of the app already uses — no new server aggregation.
  const kpis = useMemo(() => glanceKpis({
    rooms,
    workOrders: workOrders.map((w) => ({ status: w.status, floor: w.defect?.room?.floor })),
    roomTasks: roomTasks.map((rt) => ({ status: rt.status, floor: rt.room?.floor })),
  }), [rooms, workOrders, roomTasks]);
  const assignedFloorSet = useMemo(() => new Set(supervisors.flatMap((s) => s.assignedFloors)), [supervisors]);
  const unassignedFloors = useMemo(() => FLOORS.filter((f) => !assignedFloorSet.has(f)), [assignedFloorSet]);

  // --- Aufgabe D: hand the houseman a task directly, via the same shared
  // RoomTaskModal the supervisor board uses.
  const [pickedNumber, setPickedNumber] = useState("");
  const [taskRoom, setTaskRoom] = useState<Room | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const openTasks = useMemo(() => roomTasks.filter((rt) => rt.status === "OPEN"), [roomTasks]);

  const pickRoom = () => {
    const match = rooms.find((r) => r.number === pickedNumber.trim());
    if (!match) {
      setError(t("dutyManager.unknownRoom"));
      return;
    }
    setError(null);
    setTaskRoom(match);
  };

  return (
    <div className="animate-rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">{t("dutyManager.title")}</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">{t("dutyManager.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HubMoreMenu>
            <Link href="/settings" className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line">
              {t("supervisor.settingsLink")}
            </Link>
          </HubMoreMenu>
          <Link
            href="/planung"
            className="flex h-14 items-center rounded-xl bg-navy px-6 text-sm font-semibold tracking-wide text-ivory transition hover:bg-navy-line"
          >
            {t("dutyManager.planningLink")}
          </Link>
        </div>
      </div>

      <HubMissingNotice hub={hub} planner />
      {error && (
        <div className="mb-3 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 px-4 py-2 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      <ErrorBoundary>
        <TodayAtAGlance
          numbers={numbers}
          kpis={kpis}
          onChanged={() => refetchSoon()}
          source={{
            rooms,
            rows: dayRows,
            workOrders: workOrders.map((w) => ({ id: w.id, status: w.status, floor: w.defect?.room?.floor, roomNumber: w.defect?.room?.number, category: w.defect?.category })),
            roomTasks: roomTasks.map((rt) => ({ id: rt.id, status: rt.status, floor: rt.room?.floor, roomNumber: rt.room?.number, type: rt.type })),
            floors: null,
          }}
          extraKpi={{
            label: t("dutyManager.unassignedFloorsKpi"),
            value: unassignedFloors.length,
            detail: {
              title: t("dutyManager.unassignedFloorsKpi"),
              sections: [
                { title: t("glance.floorsWithoutSupervisor"), items: unassignedFloors.map((f) => ({ key: `f${f}`, title: t("glance.floorLine", { floor: f }), tone: "accent" as const })) },
                { title: t("glance.supervisorsSection"), items: supervisors.map((s) => ({ key: s.id, title: s.name, meta: s.assignedFloors.length ? s.assignedFloors.map((f) => t("glance.floorShort", { n: f })).join(", ") : t("glance.noSupervisorFloors") })) },
              ],
            },
          }}
        />
      </ErrorBoundary>

      <WindowPanel title={t("dutyManager.liveListsTitle")}>
        <LiveListsPanel />
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

        {/* Offene/erledigte Aufgaben stehen nur noch in den Live-Listen → „Hausmann-Liste“ (keine zweite Liste hier). */}
        {created && <p role="status" className="text-sm text-status-clean">{t("dutyManager.taskCreated", { n: created })}</p>}
      </WindowPanel>

      {taskRoom && (
        <RoomTaskModal
          room={taskRoom}
          onClose={() => setTaskRoom(null)}
          onSubmit={async (payload) => {
            try {
              await api("/api/roomtasks", { body: { roomId: taskRoom.id, ...payload } });
              setCreated(taskRoom.number);
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
