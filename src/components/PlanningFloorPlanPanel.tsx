"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/components/api";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import type { Assignment, PlanRoom } from "@/lib/autoplan/types";
import Modal from "@/components/Modal";
import Collapsible from "@/components/Collapsible";
import FloorPlanGrid, { FloorPlanLegend, type FloorPlanResponse, type RoomFlags } from "@/components/FloorPlanGrid";
import DayNumberTiles from "@/components/DayNumberTiles";
import DragDropBoard, { type BoardColumn } from "@/components/DragDropBoard";
import { computeDayNumbers, toCleanOnFloor, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { roomDayCategory, type RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import type { RoomType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
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
  /** Mehrere Zimmer in einem Schritt (gebündelt zuteilen); fehlt sie, wird je Zimmer `onAssign` aufgerufen. */
  onAssignMany?: (roomIds: string[], attendantId: string | null, confirmStarted: boolean) => void;
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
  initialView = "plan",
  bands,
  reloadToken = 0,
}: {
  onShiftAttendants: OnShiftAttendant[];
  actionableRoomIds: string[];
  deferredRoomIds?: string[];
  draft?: DraftBinding;
  /** Mit welcher Ansicht das Fenster startet (Grundriss oder Liste je Zimmermädchen). */
  initialView?: PanelView;
  /** Zielband der Credits je Kraft (nur Anzeige, nie eine Sperre). */
  bands?: Record<string, { lo: number; hi: number }>;
  /** Ändert sich der Wert, werden die Daten im Hintergrund neu geladen — ohne Neuaufbau (Auswahl, Scroll-Stand, Ansicht bleiben). */
  reloadToken?: number;
}) {
  const { t } = useLocale();
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [rawRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [view, setView] = useState<PanelView>(initialView);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [startedPrompt, setStartedPrompt] = useState<{ room: RoomFlags; number: string; attendantId: string | null } | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AssignMode>("housekeeper-first");
  const [activeAttendantId, setActiveAttendantId] = useState<string | null>(null);
  const [sessionRoomNumbers, setSessionRoomNumbers] = useState<string[]>([]);
  const [pickingRoom, setPickingRoom] = useState<RoomFlags | null>(null);
  const [dayRows, setDayRows] = useState<DayNumberRow[]>([]);
  const [inventory, setInventory] = useState(145);
  const [notice, setNotice] = useState<string | null>(null);
  const [multiMode, setMultiMode] = useState(false);
  const [multiPick, setMultiPick] = useState<Set<string>>(new Set());
  const [addPick, setAddPick] = useState<Set<string>>(new Set());
  const [bulkPrompt, setBulkPrompt] = useState<{ ids: string[]; attendantId: string | null; rooms: string[] } | null>(null);

  /** Hintergrund-Aktualisierung: ersetzt nur die Daten, nie den Bildschirm. Fehler sind ein Hinweis, kein Abbruch. */
  const loadLive = () => {
    Promise.all([api<{ rooms: LiveRoom[] }>("/api/rooms?allFloors=1"), api<{ rows: DayNumberRow[] }>("/api/day-numbers")])
      .then(([d, n]) => { setLiveRooms(d.rooms); setDayRows(n.rows); })
      .catch((e) => setNotice(errorText(e, t)));
  };

  useEffect(() => {
    Promise.all([
      api<FloorPlanResponse>("/api/floor-plan"),
      api<{ rooms: LiveRoom[] }>("/api/rooms?allFloors=1"),
      api<SettingsResponse & { settings?: { roomInventory?: number } }>("/api/settings"),
      api<{ rows: DayNumberRow[] }>("/api/day-numbers"),
    ])
      .then(([planData, roomsData, settingsData, numbersData]) => {
        setPlan(planData);
        setLiveRooms(roomsData.rooms);
        setSettings(settingsData);
        setDayRows(numbersData.rows);
        if (settingsData.settings?.roomInventory) setInventory(settingsData.settings.roomInventory);
      })
      .catch((e) => setError(errorText(e, t)));
  }, []);

  // Neue Daten vom Server (z. B. nach einer Zuteilung): im Hintergrund nachladen, nichts neu aufbauen
  const firstLoad = useRef(true);
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    loadLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

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

  // Zahlen: eine Quelle (computeDayNumbers). Zuteilung und Status kommen live aus dem Brett (inkl. optimistischer Änderungen/Entwurf);
  // Zuteilungen an Kräfte außerhalb der Auswahl zählen als offen (sie müssen neu zugeteilt werden).
  const onShiftIds = useMemo(() => new Set(onShiftAttendants.map((a) => a.id)), [onShiftAttendants]);
  const numbers = useMemo(() => {
    const rows = dayRows.map((r) => {
      const live = liveById.get(r.id);
      const to = live?.assignedToId ?? null;
      return { ...r, status: live?.status ?? r.status, occupied: live ? live.occupancy === "OCCUPIED" : r.occupied, assignedToId: to && onShiftIds.has(to) ? to : null, assignedToday: !!to };
    });
    return computeDayNumbers({ rows, inventory, team: onShiftAttendants.map((a) => a.id) });
  }, [dayRows, liveById, onShiftIds, inventory, onShiftAttendants]);
  const unassignedRoomIds = numbers.openIds;
  const unassignedNumbers = useMemo(
    () => new Set(unassignedRoomIds.map((id) => liveById.get(id)?.number).filter((n): n is string => Boolean(n))),
    [unassignedRoomIds, liveById]
  );
  const laundryIds = useMemo(() => new Set(numbers.laundryDue?.ids ?? []), [numbers]);

  // Category + laundry-due + credit, computed once per live room per render
  // so the grid, the credits rail and the linen list all agree.
  const now = useMemo(() => new Date(), [liveRooms]);
  const roomFacts = useMemo(() => {
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
      const laundryDue = laundryIds.has(r.id); // nur aus dem Tagesplan (echte Daten), nie geschätzt
      const credit = computeRoomCredit({ type: r.type as RoomType, category, laundryDue, credits: credits as Record<RoomType, number>, tidyCredit });
      map.set(r.id, { category, laundryDue, credit: draftCredit.get(r.id) ?? credit, guestDndActive: r.guestDndActive ?? false });
    }
    return map;
  }, [liveRooms, settings, now, draft?.rooms, laundryIds]);

  const creditsByAttendant = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of liveRooms) {
      if (!r.assignedToId) continue;
      const credit = roomFacts.get(r.id)?.credit ?? 0;
      totals.set(r.assignedToId, (totals.get(r.assignedToId) ?? 0) + credit);
    }
    return totals;
  }, [liveRooms, roomFacts]);

  const roomsDueForLinen = useMemo(() => liveRooms.filter((r) => laundryIds.has(r.id)), [liveRooms, laundryIds]);

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
      else setNotice(t("board.saveFailed") + (e instanceof Error && e.message ? ` (${e.message})` : ""));
      loadLive(); // zurückrollen: Serverstand wiederherstellen
    }
  };

  const markLinenChanged = async (roomId: string) => {
    setLiveRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, lastLinenChangeAt: new Date().toISOString() } : r)));
    try {
      await api(`/api/rooms/${roomId}/linen`, { body: {} });
    } catch (e) {
      setNotice(t("board.saveFailed") + (e instanceof Error && e.message ? ` (${e.message})` : ""));
      loadLive();
    }
  };

  /**
   * Mehrere Zimmer in einem Schritt zuteilen/verschieben/freigeben (Mehrfachauswahl, Ziehen). Optimistisch: sofort sichtbar,
   * ein Server-Aufruf, bei Fehler Meldung und Zurückrollen. Begonnene/fertige Zimmer fragen einmal gebündelt nach.
   */
  const assignMany = async (roomIds: string[], attendantId: string | null, confirmStarted = false) => {
    const rooms = roomIds.map((id) => liveById.get(id)).filter((r): r is LiveRoom => !!r && r.assignedToId !== attendantId);
    if (!rooms.length) return;
    const started = rooms.filter((r) => isStartedStatus(r.status) && r.assignedToId);
    if (!confirmStarted && started.length) { setBulkPrompt({ ids: roomIds, attendantId, rooms: started.map((r) => r.number) }); return; }
    if (draft) {
      if (draft.onAssignMany) draft.onAssignMany(rooms.map((r) => r.id), attendantId, confirmStarted);
      else for (const r of rooms) draft.onAssign(r.id, attendantId, confirmStarted);
      return;
    }
    const name = attendantId ? onShiftAttendants.find((a) => a.id === attendantId)?.name ?? "" : null;
    const ids = new Set(rooms.map((r) => r.id));
    setLiveRooms((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, assignedToId: attendantId, assignedTo: attendantId ? { id: attendantId, name: name ?? "" } : null } : r)));
    try {
      await api("/api/rooms/bulk-assign", { body: { roomIds: rooms.map((r) => r.id), attendantId, confirmStarted } });
    } catch (e) {
      if (e instanceof ApiError && e.code === "STARTED_ROOMS") setBulkPrompt({ ids: roomIds, attendantId, rooms: (e.data?.rooms as string[] | undefined) ?? [] });
      else setNotice(t("board.saveFailed") + (e instanceof Error && e.message ? ` (${e.message})` : ""));
      loadLive();
    }
  };

  const handleRoomClick = (room: RoomFlags) => {
    if (multiMode) {
      if (!liveByNumber.has(room.number)) return;
      setMultiPick((prev) => { const n = new Set(prev); if (n.has(room.number)) n.delete(room.number); else n.add(room.number); return n; });
      return;
    }
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

  const dayRowIds = useMemo(() => new Set(dayRows.map((r) => r.id)), [dayRows]);
  const roomItem = (r: LiveRoom) => ({
    id: r.id, label: r.number, mark: isStartedStatus(r.status) ? "▶" : "",
    sub: `E${r.number.slice(0, 1)} · ${Math.round((roomFacts.get(r.id)?.credit ?? 0) * 10) / 10}${laundryIds.has(r.id) ? " · 🧺" : ""}`,
    title: [r.type.replace("_", " ").toLowerCase(), laundryIds.has(r.id) ? t("board.dueLinen") : ""].filter(Boolean).join(" · "),
  });
  // Schnellauswahl im Feld „Offen": alle offenen, je Etage
  const openQuick = useMemo(() => {
    const open = liveRooms.filter((r) => unassignedRoomIds.includes(r.id));
    const floors = [...new Set(open.map((r) => r.number.slice(0, 1)))].sort();
    return [{ label: t("board.allOpen"), ids: open.map((r) => r.id) }, ...floors.map((f) => ({ label: t("board.floor", { n: f }), ids: open.filter((r) => r.number.startsWith(f)).map((r) => r.id) }))];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRooms, unassignedRoomIds]);

  const activeAttendant = onShiftAttendants.find((a) => a.id === activeAttendantId) ?? null;

  if (error && !plan) {
    return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
  }
  if (!plan) {
    return <p className="text-sm text-graphite/60">{t("planning.floorPlanLoading")}</p>;
  }

  return (
    <div className="animate-rise pb-24">
      <DayNumberTiles className="mb-3" numbers={numbers} onShowOpen={() => { setView("list"); document.getElementById("board-open")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
      {notice && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-status-in-progress/40 bg-status-in-progress/10 px-3 py-2 text-sm">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="min-h-11 rounded-lg border border-charcoal/15 px-3 text-xs font-medium">{t("common.close")}</button>
        </div>
      )}

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
      {view === "plan" && (
        <div className="mb-3">
          <button type="button" aria-pressed={multiMode} onClick={() => { setMultiMode((m) => !m); setMultiPick(new Set()); setPickingRoom(null); }}
            className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${multiMode ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>
            {t("planning.floorPlanMultiSelect")}
          </button>
          {multiMode && (
            <div className="mt-2 rounded-xl border border-gold-line bg-parchment p-3" role="group" aria-label={t("planning.floorPlanMultiSelect")}>
              <p className="mb-2 text-sm">{multiPick.size === 0 ? t("planning.floorPlanMultiHint") : t("planning.floorPlanMultiCount", { n: multiPick.size })}</p>
              {/* Ganze Etage einer Kraft zuteilen: wählt die heute zu reinigenden Zimmer der Etage, dann wie jede Auswahl zuteilen */}
              <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label={t("planning.floorPlanMultiFloors")}>
                <span className="text-xs font-medium text-graphite/70">{t("planning.floorPlanMultiFloors")}</span>
                {[...new Set(dayRows.map((r) => r.floor ?? Number(r.number.slice(0, 1))))].sort((a, b) => a - b).map((f) => (
                  <button key={f} type="button" className="h-11 min-w-11 rounded-lg border border-charcoal/15 bg-white px-3 text-sm font-medium"
                    onClick={() => setMultiPick((prev) => { const n = new Set(prev); for (const r of toCleanOnFloor(dayRows, f, (id) => liveById.get(id)?.status)) if (liveByNumber.has(r.number)) n.add(r.number); return n; })}>
                    {t("board.floor", { n: f })}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {onShiftAttendants.map((a) => (
                  <button key={a.id} type="button" disabled={multiPick.size === 0} className="h-11 rounded-lg border border-charcoal/15 bg-white px-4 text-sm font-medium disabled:opacity-40"
                    onClick={() => { const ids = [...multiPick].map((n) => liveByNumber.get(n)?.id).filter((x): x is string => !!x); setMultiPick(new Set()); void assignMany(ids, a.id); }}>{a.name}</button>
                ))}
                <button type="button" disabled={multiPick.size === 0} className="h-11 rounded-lg border border-charcoal/15 bg-white px-4 text-sm disabled:opacity-40"
                  onClick={() => { const ids = [...multiPick].map((n) => liveByNumber.get(n)?.id).filter((x): x is string => !!x); setMultiPick(new Set()); void assignMany(ids, null); }}>{t("planning.floorPlanMultiRemove")}</button>
                <button type="button" disabled={multiPick.size === 0} className="h-11 rounded-lg px-3 text-sm text-graphite/70 underline disabled:opacity-40" onClick={() => setMultiPick(new Set())}>{t("planning.floorPlanMultiClear")}</button>
              </div>
            </div>
          )}
        </div>
      )}

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
        <div id="board-open-anchor">
          <DragDropBoard
            hint={t("board.hint")}
            onMove={(ids, to) => assignMany(ids, to)}
            columns={[
              ...onShiftAttendants.map((a): BoardColumn => {
                const rooms = liveRooms.filter((r) => r.assignedToId === a.id && dayRowIds.has(r.id));
                const credits = creditsByAttendant.get(a.id) ?? 0;
                const band = bands?.[a.id];
                const bad = band ? credits > band.hi + 0.25 || (rooms.length > 0 && credits < band.lo - 0.25) : credits > targetCredits;
                return {
                  id: a.id, title: a.name, items: rooms.map(roomItem),
                  summary: <span className={`text-sm ${bad ? "font-semibold text-status-dirty" : "text-graphite/60"}`}>{Math.round(credits * 10) / 10}{band ? ` / ${band.lo}–${band.hi}` : ""} {t("planning.floorPlanCreditsShort")}</span>,
                };
              }),
              {
                id: null, title: t("planning.floorPlanOpenCard"), tone: "open",
                items: liveRooms.filter((r) => unassignedRoomIds.includes(r.id)).map(roomItem),
                quick: openQuick,
              },
            ]}
          />
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
            selected: multiMode ? multiPick.has(r.number) : mode === "housekeeper-first" && activeAttendantId != null && live?.assignedToId === activeAttendantId,
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

      {addingTo && (
        <Modal title={t("planning.floorPlanAddRoomTitle", { name: onShiftAttendants.find((a) => a.id === addingTo)?.name ?? "" })} onClose={() => { setAddingTo(null); setAddPick(new Set()); }}>
          {unassignedRoomIds.length === 0 ? <p className="text-sm text-graphite/70">{t("planning.floorPlanNoOpenRooms")}</p> : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {openQuick.map((q) => (
                  <button key={q.label} type="button" onClick={() => setAddPick((p) => new Set([...p, ...q.ids]))} className="min-h-11 rounded-full border border-dashed border-charcoal/25 px-3 text-xs font-medium hover:border-gold-line">{q.label}</button>
                ))}
              </div>
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {unassignedRoomIds.map((id) => liveById.get(id)).filter((r): r is LiveRoom => !!r).map((r) => (
                  <li key={r.id}>
                    <button type="button" aria-pressed={addPick.has(r.id)} onClick={() => setAddPick((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                      className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${addPick.has(r.id) ? "border-gold-line bg-parchment ring-2 ring-gold-line" : "border-charcoal/15 bg-white hover:border-gold-line"}`}>
                      {r.number} <span className="text-xs text-graphite/60">· {Math.round((roomFacts.get(r.id)?.credit ?? 0) * 10) / 10}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={addPick.size === 0} onClick={() => { const ids = [...addPick]; const to = addingTo; setAddPick(new Set()); setAddingTo(null); void assignMany(ids, to); }}
                className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">{t("board.nSelected", { n: addPick.size })} → {t("board.assignTo").replace(":", "")}</button>
            </>
          )}
        </Modal>
      )}

      {bulkPrompt && (
        <Modal title={t("planning.floorPlanStartedTitle", { number: bulkPrompt.rooms.join(", ") })} onClose={() => setBulkPrompt(null)}>
          <p className="mb-4 text-sm text-graphite/80">{t("planning.floorPlanStartedBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { const p = bulkPrompt; setBulkPrompt(null); void assignMany(p.ids, p.attendantId, true); }} className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">{t("planning.floorPlanStartedConfirm")}</button>
            <button type="button" onClick={() => setBulkPrompt(null)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
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
