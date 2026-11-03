"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { FLOORS, HOTEL, type RoomStatus, type RoomTaskType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import { DutyHouse } from "@/components/dutymanager/DutyHouse";
import { LegacySurface } from "@/components/supervisor/SupervisorParts";
import { Banner, Button, Field, GlassCard } from "@/components/ui";

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
  // Planstatus: dieselbe Quelle wie das Planungstool (`/api/import/status` → `plan`); schlägt der Abruf fehl, steht keine Aussage da.
  const [plan, setPlan] = useState<{ confirmed: boolean; listsChanged: boolean } | null>(null);

  const load = useCallback(async () => {
    const [roomsData, workOrdersData, roomTasksData, supervisorsData, numbersData, importStatus] = await Promise.all([
      api<{ rooms: Room[]; hub?: HubState }>("/api/rooms"),
      api<{ workOrders: WorkOrder[] }>("/api/workorders"),
      api<{ roomTasks: RoomTask[] }>("/api/roomtasks"),
      api<{ supervisors: Supervisor[] }>("/api/users/supervisors"),
      api<{ numbers: DayNumbers | null; rows?: DayNumberRow[] }>("/api/day-numbers"),
      api<{ plan?: { confirmed: boolean; listsChanged: boolean } }>("/api/import/status").catch(() => null),
    ]);
    setPlan(importStatus?.plan ?? null);
    setNumbers(numbersData.numbers);
    setDayRows(numbersData.rows ?? []);
    setRooms(roomsData.rooms);
    setHub(roomsData.hub ?? null);
    setWorkOrders(workOrdersData.workOrders);
    setRoomTasks(roomTasksData.roomTasks);
    setSupervisors(supervisorsData.supervisors);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(errorText(e, t)));
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
    <div className="animate-rise flex flex-col gap-4 sm:gap-6">
      {error && <Banner tone="warning" title={error} />}

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
          glass={(open) => (
            <DutyHouse
              numbers={numbers}
              kpis={kpis}
              rooms={rooms}
              unassignedFloors={unassignedFloors.length}
              plan={plan}
              open={open}
              notices={
                <>
                  <HubMissingNotice hub={hub} planner glass />
                  {HOTEL.unconfirmedFloors.length > 0 && (
                    <Banner tone="warning" title={t("common.unconfirmedFloorNotice", { floors: HOTEL.unconfirmedFloors.join(", ") })} />
                  )}
                </>
              }
            />
          )}
        />
      </ErrorBoundary>

      <LegacySurface title={t("dutyManager.liveListsTitle")}>
        <WindowPanel title={t("dutyManager.liveListsTitle")}>
          <LiveListsPanel />
        </WindowPanel>
      </LegacySurface>

      <GlassCard as="section" aria-labelledby="dm-tasks-title" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="dm-tasks-title" className="text-title-22 text-text-primary">{t("dutyManager.houseTasksTitle")}</h2>
          <span className="text-label text-accent-text">{openTasks.length}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field
            label={t("dutyManager.pickRoomLabel")}
            value={pickedNumber}
            onChange={(e) => setPickedNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pickRoom()}
            list="duty-manager-room-numbers"
            placeholder={t("dutyManager.pickRoomPlaceholder")}
            hint={t("dutyManager.pickRoomHint")}
            className="sm:w-64"
          />
          <datalist id="duty-manager-room-numbers">
            {rooms.map((r) => (
              <option key={r.id} value={r.number} />
            ))}
          </datalist>
          <Button onClick={pickRoom} disabled={!pickedNumber.trim()} className="sm:mb-7">
            {t("dutyManager.createTaskBtn")}
          </Button>
        </div>
        {/* Offene/erledigte Aufgaben stehen nur noch in den Live-Listen → „Hausmann-Liste“ (keine zweite Liste hier). */}
        {created && <p role="status" className="text-body-16 text-status-success-fg">{t("dutyManager.taskCreated", { n: created })}</p>}
      </GlassCard>

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
              setError(errorText(e, t));
            }
          }}
        />
      )}
    </div>
  );
}
