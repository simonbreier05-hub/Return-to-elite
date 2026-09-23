"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import FloorPlanGrid, { type FloorPlanResponse, type RoomFlags } from "@/components/FloorPlanGrid";
import { roomDayCategory } from "@/lib/rooms/roomDayCategory";
import { unassignedActionableRooms } from "@/lib/assignment/actionableRooms";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface OnShiftAttendant {
  id: string;
  name: string;
}

interface LiveRoom {
  id: string;
  number: string;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  blockReason?: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string } | null;
  arrivals: { guestName: string }[];
}

/**
 * Manual, grundriss-based counterpart to the auto-generated plan below it
 * (see PlanningView) — same fields (assignedToId, routeOrder via the apply
 * endpoint's index), just filled in by tapping instead of accepting the
 * algorithm's proposal. Persists through the same single-room endpoint the
 * hotel-wide /floor-plan reference page already uses for click assignment
 * (POST /api/rooms/[id]/assign), so a click here and a click there can never
 * disagree about how a room gets assigned.
 */
export default function PlanningFloorPlanPanel({
  onShiftAttendants,
  actionableRoomIds,
  deferredRoomIds,
}: {
  onShiftAttendants: OnShiftAttendant[];
  actionableRoomIds: string[];
  deferredRoomIds: string[];
}) {
  const { t } = useLocale();
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeAttendantId, setActiveAttendantId] = useState<string | null>(null);
  const [sessionRoomNumbers, setSessionRoomNumbers] = useState<string[]>([]);

  const loadLive = () => {
    api<{ rooms: LiveRoom[] }>("/api/rooms?allFloors=1")
      .then((d) => setLiveRooms(d.rooms))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    Promise.all([api<FloorPlanResponse>("/api/floor-plan"), api<{ rooms: LiveRoom[] }>("/api/rooms?allFloors=1")])
      .then(([planData, roomsData]) => {
        setPlan(planData);
        setLiveRooms(roomsData.rooms);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // A running click-round belongs to one attendant at a time — switching (or
  // deselecting) starts a fresh round without touching anything already
  // persisted, which lives entirely in liveRooms/assignedToId, not here.
  useEffect(() => {
    setSessionRoomNumbers([]);
  }, [activeAttendantId]);

  const liveByNumber = useMemo(() => new Map(liveRooms.map((r) => [r.number, r])), [liveRooms]);
  const liveById = useMemo(() => new Map(liveRooms.map((r) => [r.id, r])), [liveRooms]);

  const occupiedNow = useMemo(() => liveRooms.filter((r) => r.occupancy === "OCCUPIED").length, [liveRooms]);

  const assignedToIdByRoomId = useMemo(
    () => Object.fromEntries(liveRooms.map((r) => [r.id, r.assignedToId])),
    [liveRooms]
  );
  const { totalActionable, unassignedRoomIds } = useMemo(
    () => unassignedActionableRooms({ actionableRoomIds, deferredRoomIds, assignedToIdByRoomId }),
    [actionableRoomIds, deferredRoomIds, assignedToIdByRoomId]
  );
  const unassignedNumbers = useMemo(
    () => new Set(unassignedRoomIds.map((id) => liveById.get(id)?.number).filter((n): n is string => Boolean(n))),
    [unassignedRoomIds, liveById]
  );

  const assignRoom = async (room: RoomFlags, attendantId: string | null) => {
    const live = liveByNumber.get(room.number);
    if (!live) return;
    const attendantName = attendantId ? onShiftAttendants.find((a) => a.id === attendantId)?.name ?? "" : null;
    // Optimistic: the tap should show up on the grid immediately, not after
    // a round trip — reverted from a fresh fetch if the write fails.
    setLiveRooms((prev) =>
      prev.map((r) =>
        r.id === live.id
          ? { ...r, assignedToId: attendantId, assignedTo: attendantId ? { id: attendantId, name: attendantName ?? "" } : null }
          : r
      )
    );
    try {
      await api(`/api/rooms/${live.id}/assign`, { body: { attendantId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      loadLive();
    }
  };

  const handleRoomClick = (room: RoomFlags) => {
    if (!activeAttendantId) return;
    setSessionRoomNumbers((prev) => (prev.includes(room.number) ? prev : [...prev, room.number]));
    assignRoom(room, activeAttendantId);
  };

  const removeFromSession = (number: string) => {
    const room = plan?.rooms.find((r) => r.number === number);
    setSessionRoomNumbers((prev) => prev.filter((n) => n !== number));
    if (room) assignRoom(room, null);
  };

  const activeAttendant = onShiftAttendants.find((a) => a.id === activeAttendantId) ?? null;

  if (error) {
    return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
  }
  if (!plan) {
    return <p className="text-sm text-graphite/60">{t("planning.floorPlanLoading")}</p>;
  }

  return (
    <div className="animate-rise pb-24">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
        <div>
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("planning.floorPlanOccupiedNow")}</div>
          <div className="mt-1 font-serif text-3xl">{occupiedNow}</div>
        </div>
        <div>
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("planning.floorPlanUnassignedLegend")}</div>
          <div className={`mt-1 font-serif text-3xl ${unassignedRoomIds.length > 0 ? "text-gold-soft" : "text-status-clean"}`}>
            {t("planning.floorPlanUnassignedOfActionable", { unassigned: unassignedRoomIds.length, total: totalActionable })}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {onShiftAttendants.map((a) => {
          const active = a.id === activeAttendantId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveAttendantId((prev) => (prev === a.id ? null : a.id))}
              aria-pressed={active}
              className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
                active ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
              }`}
            >
              {a.name}
            </button>
          );
        })}
      </div>

      {!activeAttendantId && (
        <p className="mb-3 text-sm text-graphite/60">{t("planning.floorPlanPickAttendantHint")}</p>
      )}

      <FloorPlanGrid
        plan={plan}
        onRoomClick={handleRoomClick}
        getRoomMeta={(r) => {
          const live = liveByNumber.get(r.number);
          const category = live
            ? roomDayCategory({
                occupancy: live.occupancy ?? "VACANT",
                isCheckoutToday: live.isCheckoutToday,
                blockReason: live.blockReason,
                hasExpectedArrival: live.arrivals.length > 0,
              })
            : "NONE";
          return {
            category,
            selected: activeAttendantId != null && live?.assignedToId === activeAttendantId,
            unassignedActionable: unassignedNumbers.has(r.number),
            badge: live?.assignedTo?.name.split(" ")[0],
            title:
              [
                live?.assignedTo && `${live.assignedTo.name}`,
                unassignedNumbers.has(r.number) && t("planning.floorPlanUnassignedLegend"),
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          };
        }}
      />

      {activeAttendant && (
        <div className="fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-charcoal/10 bg-linen/95 p-4 shadow-lift backdrop-blur sm:left-auto sm:right-4 sm:w-80">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-serif text-xl">{t("planning.floorPlanActivePanelTitle", { name: activeAttendant.name })}</h4>
            <button
              type="button"
              onClick={() => setActiveAttendantId(null)}
              className="h-9 rounded-lg border border-charcoal/15 px-3 text-xs font-medium hover:border-gold-line"
            >
              {t("planning.floorPlanDeselectAttendant")}
            </button>
          </div>
          {sessionRoomNumbers.length === 0 ? (
            <p className="mt-2 text-xs text-graphite/60">{t("planning.floorPlanActivePanelEmpty")}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {sessionRoomNumbers.map((number) => (
                <li key={number}>
                  <button
                    type="button"
                    onClick={() => removeFromSession(number)}
                    title={t("planning.floorPlanRemoveRoom", { number })}
                    className="flex h-9 items-center gap-1 rounded-lg border border-charcoal/15 bg-white px-2.5 text-sm font-medium hover:border-status-out-of-order/40 hover:text-status-out-of-order"
                  >
                    {number} <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
