"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/components/api";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import type { Assignment, PlanRoom } from "@/lib/autoplan/types";
import type { FloorPlanResponse, RoomFlags } from "@/components/FloorPlanGrid";
import { computeDayNumbers, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { roomDayCategory, type RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import type { RoomType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";

export interface OnShiftAttendant {
  id: string;
  name: string;
}

export interface LiveRoom {
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
  /** Hausregeln (u. a. Zimmer-Spannen je Typ, `roomInventory`). */
  settings?: Record<string, number>;
}

export type AssignMode = "room-first" | "housekeeper-first";
export type PanelView = "plan" | "list";

/** Entwurfsmodus (Planungstool, Schritt „Plan“): dieselbe Ansicht, aber die Zuteilung kommt aus dem Entwurf und geht dorthin zurück. */
export interface DraftBinding {
  rooms: PlanRoom[];
  assignment: Assignment;
  /** Die Kraft wechselt; `confirmStarted` ist gesetzt, wenn für ein begonnenes/fertiges Zimmer ausdrücklich bestätigt wurde. */
  onAssign: (roomId: string, attendantId: string | null, confirmStarted: boolean) => void;
  /** Mehrere Zimmer in einem Schritt (gebündelt zuteilen); fehlt sie, wird je Zimmer `onAssign` aufgerufen. */
  onAssignMany?: (roomIds: string[], attendantId: string | null, confirmStarted: boolean) => void;
}

/**
 * Logik des Zuteilungs-Grundrisses (Daten laden, Zahlen, Credits, Zuteilen/Verschieben/Entfernen, Mehrfachauswahl,
 * Wäschewechsel). Unverändert aus `PlanningFloorPlanPanel` herausgelöst (Design D3), damit die alte Darstellung
 * (Planungstool, Entwurfsmodus) und die Glas-Tagesplanung (`/floor-plan`) dieselben Wege nutzen — keine zweite Zuteilungslogik.
 */
export function usePlanningFloorPlan({
  onShiftAttendants,
  draft,
  initialView = "plan",
  reloadToken = 0,
}: {
  onShiftAttendants: OnShiftAttendant[];
  draft?: DraftBinding;
  initialView?: PanelView;
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
      const credit = computeRoomCredit({ type: r.type as RoomType, credits: credits as Record<RoomType, number> });
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


  return { plan, setPlan, rawRooms, setLiveRooms, view, setView, addingTo, setAddingTo, startedPrompt, setStartedPrompt, settings, setSettings, error, setError, mode, setMode, activeAttendantId, setActiveAttendantId, sessionRoomNumbers, setSessionRoomNumbers, pickingRoom, setPickingRoom, dayRows, setDayRows, inventory, setInventory, notice, setNotice, multiMode, setMultiMode, multiPick, setMultiPick, addPick, setAddPick, bulkPrompt, setBulkPrompt, loadLive, firstLoad, changeMode, liveRooms, liveByNumber, liveById, onShiftIds, numbers, unassignedRoomIds, unassignedNumbers, laundryIds, now, roomFacts, creditsByAttendant, roomsDueForLinen, targetCredits, assignRoom, markLinenChanged, assignMany, handleRoomClick, removeFromSession, dayRowIds, roomItem, openQuick, activeAttendant };
}
