"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import Modal from "@/components/Modal";
import FloorPlanGrid, { FloorPlanLegend, type FloorPlanResponse, type RoomFlags } from "@/components/FloorPlanGrid";
import OccupancyCleanCounter from "@/components/OccupancyCleanCounter";
import { roomDayCategory, type RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { isLaundryDue } from "@/lib/rooms/laundryDue";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import { unassignedActionableRooms } from "@/lib/assignment/actionableRooms";
import type { RoomType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

interface OnShiftAttendant {
  id: string;
  name: string;
}

interface LiveRoom {
  id: string;
  number: string;
  type: string;
  status: string;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  blockReason?: string | null;
  lastLinenChangeAt?: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string } | null;
  arrivals: { guestName: string }[];
}

interface SettingsResponse {
  roomTypeCredits: Record<string, number>;
  planningCredits: { tidyCredit: number; linenCycleDays: number; targetCreditsPerAttendant: number };
}

type AssignMode = "room-first" | "housekeeper-first";

const DAY_CATEGORY_KEY: Record<RoomDayCategory, TKey | null> = {
  ARRIVAL: "planning.dayCategoryArrival",
  DEPARTURE: "planning.dayCategoryDeparture",
  STAYOVER: "planning.dayCategoryStayover",
  SAME_DAY_TURN: "planning.dayCategorySameDayTurn",
  DND: "planning.dayCategoryDnd",
  NONE: null,
};

/**
 * Manual, grundriss-based counterpart to the auto-generated plan above it
 * (see PlanningView) — same fields (assignedToId, routeOrder via the apply
 * endpoint's index), just filled in by tapping instead of accepting the
 * algorithm's proposal. Persists through the same single-room endpoint the
 * hotel-wide /floor-plan reference page already uses for click assignment
 * (POST /api/rooms/[id]/assign), so a click here and a click there can never
 * disagree about how a room gets assigned.
 *
 * Two assignment modes share the same grid and the same assign call (see
 * /floor-plan's room-first/housekeeper-first split): "room-first" opens a
 * picker for the tapped room; "housekeeper-first" keeps the existing
 * pick-then-tap flow with the on-shift rail at the screen edge.
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
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AssignMode>("housekeeper-first");
  const [activeAttendantId, setActiveAttendantId] = useState<string | null>(null);
  const [sessionRoomNumbers, setSessionRoomNumbers] = useState<string[]>([]);
  const [pickingRoom, setPickingRoom] = useState<RoomFlags | null>(null);

  const loadLive = () => {
    api<{ rooms: LiveRoom[] }>("/api/rooms?allFloors=1")
      .then((d) => setLiveRooms(d.rooms))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    Promise.all([
      api<FloorPlanResponse>("/api/floor-plan"),
      api<{ rooms: LiveRoom[] }>("/api/rooms?allFloors=1"),
      api<SettingsResponse>("/api/settings"),
    ])
      .then(([planData, roomsData, settingsData]) => {
        setPlan(planData);
        setLiveRooms(roomsData.rooms);
        setSettings(settingsData);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // A running click-round belongs to one attendant at a time — switching (or
  // deselecting) starts a fresh round without touching anything already
  // persisted, which lives entirely in liveRooms/assignedToId, not here.
  useEffect(() => {
    setSessionRoomNumbers([]);
  }, [activeAttendantId]);

  // Switching modes clears whatever the other mode had picked, so a
  // half-finished room-first pick can never leak into housekeeper-first.
  const changeMode = (next: AssignMode) => {
    setMode(next);
    setActiveAttendantId(null);
    setPickingRoom(null);
  };

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

  // Category + laundry-due + credit, computed once per live room per render
  // so the grid, the credits rail and the linen list all agree.
  const now = useMemo(() => new Date(), [liveRooms]);
  const roomFacts = useMemo(() => {
    const linenCycleDays = settings?.planningCredits.linenCycleDays ?? 3;
    const credits = settings?.roomTypeCredits ?? {};
    const tidyCredit = settings?.planningCredits.tidyCredit ?? 0.5;
    const map = new Map<
      string,
      { category: RoomDayCategory; laundryDue: boolean; credit: number }
    >();
    for (const r of liveRooms) {
      const category = roomDayCategory({
        occupancy: r.occupancy ?? "VACANT",
        isCheckoutToday: r.isCheckoutToday,
        blockReason: r.blockReason,
        hasExpectedArrival: r.arrivals.length > 0,
      });
      const laundryDue = isLaundryDue({
        category,
        lastLinenChangeAt: r.lastLinenChangeAt ? new Date(r.lastLinenChangeAt) : null,
        now,
        linenCycleDays,
      });
      const credit = computeRoomCredit({ type: r.type as RoomType, category, laundryDue, credits: credits as Record<RoomType, number>, tidyCredit });
      map.set(r.id, { category, laundryDue, credit });
    }
    return map;
  }, [liveRooms, settings, now]);

  const creditsByAttendant = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of liveRooms) {
      if (!r.assignedToId) continue;
      const credit = roomFacts.get(r.id)?.credit ?? 0;
      totals.set(r.assignedToId, (totals.get(r.assignedToId) ?? 0) + credit);
    }
    return totals;
  }, [liveRooms, roomFacts]);

  const roomsDueForLinen = useMemo(
    () => liveRooms.filter((r) => roomFacts.get(r.id)?.laundryDue),
    [liveRooms, roomFacts]
  );

  const targetCredits = settings?.planningCredits.targetCreditsPerAttendant ?? 14;

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

  const markLinenChanged = async (roomId: string) => {
    setLiveRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, lastLinenChangeAt: new Date().toISOString() } : r)));
    try {
      await api(`/api/rooms/${roomId}/linen`, { body: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      loadLive();
    }
  };

  const handleRoomClick = (room: RoomFlags) => {
    if (mode === "room-first") {
      setPickingRoom(room);
      return;
    }
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
          <div className="mt-1 font-serif text-3xl">
            {t("planning.floorPlanOccupiedOfTotal", { occupied: occupiedNow, total: liveRooms.length })}
          </div>
        </div>
        <div>
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("planning.floorPlanUnassignedLegend")}</div>
          <div className={`mt-1 font-serif text-3xl ${unassignedRoomIds.length > 0 ? "text-gold-soft" : "text-status-clean"}`}>
            {t("planning.floorPlanUnassignedOfActionable", { unassigned: unassignedRoomIds.length, total: totalActionable })}
          </div>
        </div>
        <OccupancyCleanCounter rooms={liveRooms.map((r) => ({ occupancy: r.occupancy ?? "VACANT", status: r.status }))} />
      </div>

      <FloorPlanLegend
        className="mb-3"
        occupiedLabel={t("planning.floorPlanLegendOccupied")}
        laundryLabel={t("planning.floorPlanLegendLaundryDue")}
        categoryLabels={{
          ARRIVAL: t("planning.dayCategoryArrival"),
          DEPARTURE: t("planning.dayCategoryDeparture"),
          STAYOVER: t("planning.dayCategoryStayover"),
          SAME_DAY_TURN: t("planning.dayCategorySameDayTurn"),
          DND: t("planning.dayCategoryDnd"),
        }}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeMode("room-first")}
          aria-pressed={mode === "room-first"}
          className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
            mode === "room-first" ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
          }`}
        >
          {t("planning.floorPlanModeRoomFirst")}
        </button>
        <button
          type="button"
          onClick={() => changeMode("housekeeper-first")}
          aria-pressed={mode === "housekeeper-first"}
          className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
            mode === "housekeeper-first" ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
          }`}
        >
          {t("planning.floorPlanModeHousekeeperFirst")}
        </button>
      </div>

      {mode === "room-first" ? (
        <p className="mb-3 text-sm text-graphite/60">{t("planning.floorPlanModeRoomFirstHint")}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {onShiftAttendants.map((a) => {
              const active = a.id === activeAttendantId;
              const credits = creditsByAttendant.get(a.id) ?? 0;
              const over = credits > targetCredits;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveAttendantId((prev) => (prev === a.id ? null : a.id))}
                  aria-pressed={active}
                  title={over ? t("planning.floorPlanCreditsOverTarget", { target: targetCredits }) : undefined}
                  className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
                    active ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
                  }`}
                >
                  {a.name}{" "}
                  <span className={over ? "font-semibold text-status-dirty" : "text-graphite/60"}>
                    · {credits} {t("planning.floorPlanCreditsShort")}
                  </span>
                </button>
              );
            })}
          </div>
          {!activeAttendantId && <p className="mb-3 text-sm text-graphite/60">{t("planning.floorPlanPickAttendantHint")}</p>}
        </>
      )}

      <FloorPlanGrid
        plan={plan}
        onRoomClick={handleRoomClick}
        getRoomMeta={(r) => {
          const live = liveByNumber.get(r.number);
          const facts = live ? roomFacts.get(live.id) : undefined;
          const category = facts?.category ?? "NONE";
          return {
            category,
            occupancy: live?.occupancy,
            isCheckoutToday: live?.isCheckoutToday ?? false,
            laundryDue: facts?.laundryDue ?? false,
            selected: mode === "housekeeper-first" && activeAttendantId != null && live?.assignedToId === activeAttendantId,
            unassignedActionable: unassignedNumbers.has(r.number),
            badge: live?.assignedTo?.name.split(" ")[0],
            title:
              [
                live?.assignedTo && `${live.assignedTo.name}`,
                unassignedNumbers.has(r.number) && t("planning.floorPlanUnassignedLegend"),
                DAY_CATEGORY_KEY[category] && t(DAY_CATEGORY_KEY[category] as TKey),
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          };
        }}
      />

      {roomsDueForLinen.length > 0 && (
        <div className="mt-3 rounded-2xl border border-status-in-progress/30 bg-status-in-progress/10 p-4">
          <h4 className="mb-2 font-serif text-lg text-status-in-progress">{t("planning.floorPlanLinenSectionTitle")}</h4>
          <ul className="flex flex-wrap gap-2">
            {roomsDueForLinen.map((r) => (
              <li key={r.id} className="flex items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm">
                <span className="font-medium">{r.number}</span>
                <button
                  type="button"
                  onClick={() => markLinenChanged(r.id)}
                  className="rounded-md border border-charcoal/15 px-2 py-0.5 text-xs font-medium hover:border-gold-line"
                >
                  {t("planning.floorPlanLinenMarkChanged")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "housekeeper-first" && activeAttendant && (
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

      {mode === "room-first" && pickingRoom && (
        <Modal
          title={t("planning.floorPlanPickAttendantForRoom", { number: pickingRoom.number })}
          onClose={() => setPickingRoom(null)}
        >
          <div className="grid gap-2">
            {onShiftAttendants.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  assignRoom(pickingRoom, a.id);
                  setPickingRoom(null);
                }}
                className="flex h-14 items-center justify-between rounded-xl border border-charcoal/15 px-4 text-left hover:border-gold-line"
              >
                <span className="font-medium">{a.name}</span>
                <span className="text-sm text-graphite/60">
                  {creditsByAttendant.get(a.id) ?? 0} {t("planning.floorPlanCreditsShort")}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
