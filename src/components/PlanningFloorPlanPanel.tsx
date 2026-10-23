"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/components/api";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import type { Assignment, PlanRoom } from "@/lib/autoplan/types";
import Modal from "@/components/Modal";
import Collapsible from "@/components/Collapsible";
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
  guestDndActive?: boolean;
}

interface SettingsResponse {
  roomTypeCredits: Record<string, number>;
  planningCredits: { tidyCredit: number; linenCycleDays: number; targetCreditsPerAttendant: number };
}

type AssignMode = "room-first" | "housekeeper-first";
type PanelView = "plan" | "list";

/** Entwurfsmodus (Planungstool, Schritt „Plan“): dieselbe Ansicht, aber die Zuteilung kommt aus dem Entwurf und geht dorthin zurück. */
export interface DraftBinding {
  rooms: PlanRoom[];
  assignment: Assignment;
  /** Die Kraft wechselt; `confirmStarted` ist gesetzt, wenn für ein begonnenes/fertiges Zimmer ausdrücklich bestätigt wurde. */
  onAssign: (roomId: string, attendantId: string | null, confirmStarted: boolean) => void;
}

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
  deferredRoomIds = [],
  draft,
}: {
  onShiftAttendants: OnShiftAttendant[];
  actionableRoomIds: string[];
  deferredRoomIds?: string[];
  draft?: DraftBinding;
}) {
  const { t } = useLocale();
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [rawRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [view, setView] = useState<PanelView>("plan");
  const [startedPrompt, setStartedPrompt] = useState<{ room: RoomFlags; number: string; attendantId: string | null } | null>(null);
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

  // Im Entwurfsmodus kommt die Zuteilung aus dem Entwurf (nicht aus der Datenbank).
  const liveRooms = useMemo<LiveRoom[]>(() => {
    if (!draft) return rawRooms;
    const nameOf = new Map(onShiftAttendants.map((a) => [a.id, a.name]));
    const inDraft = new Set(draft.rooms.map((r) => r.id));
    return rawRooms.map((r) => {
      const to = inDraft.has(r.id) ? draft.assignment[r.id] ?? null : null;
      return { ...r, assignedToId: to, assignedTo: to ? { id: to, name: nameOf.get(to) ?? "" } : null };
    });
  }, [rawRooms, draft, onShiftAttendants]);

  const liveByNumber = useMemo(() => new Map(liveRooms.map((r) => [r.number, r])), [liveRooms]);
  const liveById = useMemo(() => new Map(liveRooms.map((r) => [r.id, r])), [liveRooms]);

  const occupiedNow = useMemo(() => liveRooms.filter((r) => r.occupancy === "OCCUPIED").length, [liveRooms]);

  // Zimmer, die einer heute nicht arbeitenden Kraft gehören, zählen als offen (sie müssen neu zugeteilt werden).
  const onShiftIds = useMemo(() => new Set(onShiftAttendants.map((a) => a.id)), [onShiftAttendants]);
  const assignedToIdByRoomId = useMemo(
    () => Object.fromEntries(liveRooms.map((r) => [r.id, r.assignedToId && onShiftIds.has(r.assignedToId) ? r.assignedToId : null])),
    [liveRooms, onShiftIds]
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
    const draftCredit = new Map((draft?.rooms ?? []).map((r) => [r.id, r.credits]));
    const tidyCredit = settings?.planningCredits.tidyCredit ?? 0.5;
    const map = new Map<
      string,
      { category: RoomDayCategory; laundryDue: boolean; credit: number; guestDndActive: boolean }
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
      map.set(r.id, { category, laundryDue, credit: draftCredit.get(r.id) ?? credit, guestDndActive: r.guestDndActive ?? false });
    }
    return map;
  }, [liveRooms, settings, now, draft?.rooms]);

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

  /**
   * Zuteilen, verschieben oder entfernen — ohne Sperren. Begonnene/fertige Zimmer fragen zuerst nach (Fortschritt bleibt erhalten).
   * Credit-Ziel und Etagenlimit sind nur Hinweise und blockieren nie.
   */
  const assignRoom = async (room: RoomFlags, attendantId: string | null, confirmStarted = false) => {
    const live = liveByNumber.get(room.number);
    if (!live) return;
    if (live.assignedToId === attendantId) return;
    if (!confirmStarted && isStartedStatus(live.status) && live.assignedToId) {
      setStartedPrompt({ room, number: room.number, attendantId });
      return;
    }
    if (draft) { draft.onAssign(live.id, attendantId, confirmStarted); return; }
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
      await api(`/api/rooms/${live.id}/assign`, { body: { attendantId, confirmStarted } });
    } catch (e) {
      if (e instanceof ApiError && e.code === "STARTED_ROOM") setStartedPrompt({ room, number: room.number, attendantId });
      else setError(e instanceof Error ? e.message : String(e));
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
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("planning.floorPlanAssignmentLabel")}</div>
          <div className={`mt-1 font-serif text-3xl ${unassignedRoomIds.length > 0 ? "text-gold-soft" : "text-status-clean"}`}>
            {t("planning.floorPlanAssignedOf", { assigned: totalActionable - unassignedRoomIds.length, total: totalActionable })}
          </div>
          {unassignedRoomIds.length > 0 && (
            <div className="mt-0.5 text-sm font-medium text-gold-soft">{t("planning.floorPlanUnassignedOfActionable", { unassigned: unassignedRoomIds.length, total: totalActionable })}</div>
          )}
        </div>
        <OccupancyCleanCounter rooms={liveRooms.map((r) => ({ occupancy: r.occupancy ?? "VACANT", status: r.status }))} />
      </div>

      <FloorPlanLegend
        className="mb-3"
        occupiedLabel={t("planning.floorPlanLegendOccupied")}
        laundryLabel={t("planning.floorPlanLegendLaundryDue")}
        guestDndLabel={t("planning.floorPlanLegendGuestDnd")}
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

      <div className="mb-3 flex flex-wrap gap-2">
        {(["plan", "list"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${view === v ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>
            {v === "plan" ? t("planning.floorPlanViewPlan") : t("planning.floorPlanViewList")}
          </button>
        ))}
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

      {view === "list" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...onShiftAttendants.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null as string | null, name: t("planning.floorPlanOpenCard") }].map((col) => {
            const rooms = liveRooms.filter((r) => (col.id === null ? unassignedRoomIds.includes(r.id) : r.assignedToId === col.id) && (col.id === null || totalActionable === 0 || actionableRoomIds.includes(r.id)));
            const credits = col.id ? creditsByAttendant.get(col.id) ?? 0 : null;
            return (
              <section key={col.id ?? "open"} className={`rounded-2xl border p-3 ${col.id === null && rooms.length ? "border-status-in-progress/40 bg-white" : "border-charcoal/10 bg-white"}`}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h4 className="font-serif text-lg">{col.name} <span className="text-sm text-graphite/60">· {rooms.length}</span></h4>
                  {credits !== null && <span className={`text-sm ${credits > targetCredits ? "font-semibold text-status-dirty" : "text-graphite/60"}`}>{Math.round(credits * 10) / 10} {t("planning.floorPlanCreditsShort")}</span>}
                </div>
                {rooms.length === 0 ? <p className="text-xs text-graphite/50">{t("planning.floorPlanNoRooms")}</p> : (
                  <ul className="flex flex-wrap gap-1.5">
                    {rooms.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => { const f = plan.rooms.find((x) => x.number === r.number); if (f) setPickingRoom(f); }}
                          className="min-h-11 rounded-lg border border-charcoal/15 bg-white px-3 text-sm font-medium hover:border-gold-line">
                          {r.number}{isStartedStatus(r.status) ? " ▶" : ""} <span className="text-xs text-graphite/60">{Math.round((roomFacts.get(r.id)?.credit ?? 0) * 10) / 10}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
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
            guestDndActive: facts?.guestDndActive ?? false,
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
      )}

      {roomsDueForLinen.length > 0 && (
        <div className="mt-3 rounded-2xl border border-status-in-progress/30 bg-status-in-progress/10 p-4">
          <Collapsible
            defaultOpen={roomsDueForLinen.length <= 8}
            summary={
              <h4 className="font-serif text-lg text-status-in-progress">
                {t("planning.floorPlanLinenSectionTitle")} · {roomsDueForLinen.length}
              </h4>
            }
          >
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
          </Collapsible>
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

      {pickingRoom && (mode === "room-first" || view === "list") && (
        <Modal
          title={t("planning.floorPlanPickAttendantForRoom", { number: pickingRoom.number })}
          onClose={() => setPickingRoom(null)}
        >
          <div className="grid gap-2">
            {onShiftAttendants.map((a) => {
              const credits = creditsByAttendant.get(a.id) ?? 0;
              const over = credits > targetCredits;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    assignRoom(pickingRoom, a.id);
                    setPickingRoom(null);
                  }}
                  title={over ? t("planning.floorPlanCreditsOverTarget", { target: targetCredits }) : undefined}
                  className="flex h-14 items-center justify-between rounded-xl border border-charcoal/15 px-4 text-left hover:border-gold-line"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className={`text-sm ${over ? "font-semibold text-status-dirty" : "text-graphite/60"}`}>
                    {credits} {t("planning.floorPlanCreditsShort")}
                  </span>
                </button>
              );
            })}
            {liveByNumber.get(pickingRoom.number)?.assignedToId && (
              <button type="button" onClick={() => { assignRoom(pickingRoom, null); setPickingRoom(null); }}
                className="flex h-12 items-center justify-center rounded-xl border border-charcoal/15 px-4 text-sm font-medium text-graphite hover:border-status-out-of-order/40">
                {t("planning.floorPlanOpenCard")}
              </button>
            )}
          </div>
        </Modal>
      )}

      {startedPrompt && (
        <Modal title={t("planning.floorPlanStartedTitle", { number: startedPrompt.number })} onClose={() => setStartedPrompt(null)}>
          <p className="mb-4 text-sm text-graphite/80">{t("planning.floorPlanStartedBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { const p = startedPrompt; setStartedPrompt(null); void assignRoom(p.room, p.attendantId, true); }}
              className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">{t("planning.floorPlanStartedConfirm")}</button>
            <button type="button" onClick={() => setStartedPrompt(null)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
