"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import Collapsible from "@/components/Collapsible";
import type { ThreadNote } from "@/components/NoteThread";
import PriorityBanner from "@/components/PriorityBanner";
import SupervisorList from "@/components/lists/SupervisorList";
import RoomTaskModal from "@/components/RoomTaskModal";
import SupervisorGlance from "@/components/SupervisorGlance";
import SupervisorFeed from "@/components/SupervisorFeed";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DetailContainer } from "@/components/shell/DetailContainer";
import { HkNoteThread } from "@/components/hk/HkParts";
import { Banner, Field, FilterChip, GlassCard, Glyph } from "@/components/ui";
import { SupervisorHub, type HubTile } from "@/components/supervisor/SupervisorHub";
import { OooDialog, ReworkDialog, SupervisorRoomDetail } from "@/components/supervisor/SupervisorRoomDetail";
import { GlassSelect, ReleaseQueueCard, StatusLegend, StatusTile } from "@/components/supervisor/SupervisorParts";
import { GlassRedistribution } from "@/components/supervisor/GlassRedistribution";
import {
  BLOCK_REASON_SHORT,
  HOTEL,
  type BlockReason,
  type NoteStatus,
  type RoomStatus,
} from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import { TILE_UI } from "@/lib/ui/room-tile";
import { withoutLeadingSymbol } from "@/lib/ui/hkHub";
import {
  roomCreditOf,
  roomGroups,
  rosterEntries,
  SUP_KPI_STATUS,
  supervisorKpis,
  tileStateOf,
  type CreditSettings,
  type SupKpi,
} from "@/lib/ui/supervisorHub";

interface Note {
  id: string;
  body: string;
  status: NoteStatus;
  author: { name: string; role: string };
  createdAt: string;
  roomId?: string;
}

interface Room {
  id: string;
  number: string;
  floor: number;
  section: string;
  type: string;
  status: RoomStatus;
  statusSince: string;
  blockReason?: string | null;
  reworkNote?: string | null;
  oooUntil?: string | null;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  routeOrder?: number | null;
  openNotesCount: number;
  assignedTo?: { id: string; name: string; dailyNumber?: number | null } | null;
  arrivals: { guestName: string; eta?: string | null; vip: boolean; neededNow: boolean }[];
  notes: Note[];
  defects: { id: string; category: string; note: string; workOrder?: { status: string } | null }[];
  /** Open guest "Bitte nicht stören" request (Prompt G2 Teil 4) — never Room.status/blockReason. */
  guestDndActive?: boolean;
}

interface Attendant {
  id: string;
  name: string;
  section?: string | null;
  currentRoomId?: string | null;
  lastSeenAt?: string | null;
  dailyNumber?: number | null;
}

/** "#3 Maria Silva" when today's plan has assigned a short radio number, otherwise just the name. */
function attendantLabel(a: { name: string; dailyNumber?: number | null }): string {
  return a.dailyNumber ? `#${a.dailyNumber} ${a.name}` : a.name;
}

const LEGEND: RoomStatus[] = [
  "DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "PICKUP", "BLOCKED",
  "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT",
];

/** Matches the KPI card's own "backlog" accent below — one number, used both
 * to flag the stat card and to decide the priority banner's urgency tone. */
const RELEASE_QUEUE_BACKLOG = 5;

export default function SupervisorView({ isDutyManager }: { isDutyManager: boolean }) {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "rework" | "ooo" | "roomTask"; room: Room } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "ALL">("ALL");
  const [floorFilter, setFloorFilter] = useState<number | "ALL">("ALL");
  const [attendantFilter, setAttendantFilter] = useState<string>("ALL");
  const [guestDndOnly, setGuestDndOnly] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  // Non-null when the server scoped this board to the signed-in supervisor's
  // assigned floor(s) — see GET /api/rooms. Null for duty_manager (never
  // scoped) and for a supervisor with no floors assigned yet (fails open).
  const [floorScope, setFloorScope] = useState<number[] | null>(null);
  const [hub, setHub] = useState<HubState | null>(null);
  const router = useRouter();
  // „Team heute“ (D3): gewählte Kraft; Credits je Zimmer wie im Grundriss (Einstellungen + Wäschewechsel aus dem Tagesplan).
  const [selectedAttendantId, setSelectedAttendantId] = useState<string | null>(null);
  const [creditSettings, setCreditSettings] = useState<CreditSettings | null>(null);
  const [laundryIds, setLaundryIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await api<{ rooms: Room[]; attendants: Attendant[]; floorScope: number[] | null; hub?: HubState }>("/api/rooms");
    setRooms(data.rooms);
    setHub(data.hub ?? null);
    setAttendants(data.attendants);
    setFloorScope(data.floorScope);
  }, []);

  // Nur Anzeige (Credits in „Team heute“): dieselben Quellen wie der Grundriss, Fehler lassen die Credits leer (0).
  const loadCredits = useCallback(async () => {
    const [settings, day] = await Promise.all([
      api<{ roomTypeCredits: Record<string, number> }>("/api/settings").catch(() => null),
      api<{ numbers: { laundryDue: { ids: string[] } | null } | null }>("/api/day-numbers").catch(() => null),
    ]);
    if (settings) setCreditSettings({ roomTypeCredits: settings.roomTypeCredits });
    if (day) setLaundryIds(new Set(day.numbers?.laundryDue?.ids ?? []));
  }, []);

  useEffect(() => {
    load();
    void loadCredits();
  }, [load, loadCredits]);
  const creditsSoon = useCoalescedRefetch(loadCredits, 4000);

  // Arrivals are nested inside the room payload and cannot be patched from an
  // arrival event alone, so those fall back to a coalesced refetch.
  const refetchSoon = useCoalescedRefetch(load, 2000);

  useSocket({
    "app:resync": () => { refetchSoon(); creditsSoon(); },
    // Tagesplan im Planungshub berechnet/geändert → Board neu laden (auch der erste Plan des Tages).
    "dayplan:updated": () => { refetchSoon(); creditsSoon(); },
    // Patch the changed room in place. The broadcast carries only scalar room
    // fields plus assignedTo, so spreading it preserves the nested arrivals,
    // notes and defects already held in state.
    "room:update": (p: { room: Room }) => {
      setRooms((prev) => {
        const known = prev.some((r) => r.id === p.room.id);
        if (!known) {
          refetchSoon();
          return prev;
        }
        return prev.map((r) => (r.id === p.room.id ? { ...r, ...p.room } : r));
      });
    },
    "room:status": (p: { number: string; from: string; to: string; by: string }) => {
      setTicker(`${p.number}: ${p.from} → ${p.to} (${p.by})`);
      setTimeout(() => setTicker(null), 6000);
    },
    "attendant:location": (p: { userId: string; roomId: string }) => {
      setAttendants((prev) =>
        prev.map((a) => (a.id === p.userId ? { ...a, currentRoomId: p.roomId, lastSeenAt: new Date().toISOString() } : a))
      );
    },
    "note:new": (p: { note: Note }) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === p.note.roomId ? { ...r, notes: [p.note, ...r.notes].slice(0, 3), openNotesCount: r.openNotesCount + 1 } : r
        )
      );
    },
    // A toggle may land on a note outside the 3-item preview window, so the
    // preview is patched directly for instant feedback but openNotesCount —
    // an aggregate over the *full* thread — is left to the coalesced refetch.
    "note:update": (p: { note: Note }) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === p.note.roomId ? { ...r, notes: r.notes.map((n) => (n.id === p.note.id ? p.note : n)) } : r
        )
      );
      refetchSoon();
    },
    "arrival:update": () => refetchSoon(),
    // A whole plan changed at once — one refetch instead of 145 patches.
    "assignments:applied": () => refetchSoon(),
    // Guest DND/clean/contact requests (Prompt G2 Teil 4) — a coalesced
    // refetch is simplest here: guestDndActive/guestRequests aren't part of
    // the scalar room:update payload, and this fires rarely enough that a
    // full refetch is cheap.
    "guestrequest:new": () => refetchSoon(),
    "guestrequest:update": () => refetchSoon(),
  });

  /**
   * The grid is filtered; the KPIs above it are not. A supervisor narrowing to
   * floor 3 still needs the house-wide release count to stay honest.
   */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (statusFilter !== "ALL" && room.status !== statusFilter) return false;
      if (floorFilter !== "ALL" && room.floor !== floorFilter) return false;
      if (attendantFilter === "NONE" && room.assignedTo) return false;
      if (attendantFilter !== "ALL" && attendantFilter !== "NONE" && room.assignedTo?.id !== attendantFilter) return false;
      if (guestDndOnly && !room.guestDndActive) return false;
      if (!q) return true;
      return (
        room.number.toLowerCase().includes(q) ||
        room.section.toLowerCase().includes(q) ||
        room.assignedTo?.name.toLowerCase().includes(q) ||
        room.arrivals.some((a) => a.guestName.toLowerCase().includes(q))
      );
    });
  }, [rooms, search, statusFilter, floorFilter, attendantFilter, guestDndOnly]);

  const filtersActive =
    search.trim() !== "" ||
    statusFilter !== "ALL" ||
    floorFilter !== "ALL" ||
    attendantFilter !== "ALL" ||
    guestDndOnly;

  const guestDndCount = rooms.filter((r) => r.guestDndActive).length;
  const byFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const room of visible) {
      if (!map.has(room.floor)) map.set(room.floor, []);
      map.get(room.floor)!.push(room);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [visible]);

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const selected = selectedId ? roomById.get(selectedId) ?? null : null;

  const releaseQueue = rooms.filter((r) => r.status === "CLEAN");
  const blockedCount = rooms.filter((r) => r.status === "BLOCKED").length;

  /** Single place where a status change is issued, so busy-state and error handling are consistent. */
  const act = async (room: Room, status: RoomStatus, extra: Record<string, unknown> = {}) => {
    if (busyRoomId) return; // guards against a double tap while a request is in flight
    setBusyRoomId(room.id);
    setError(null);
    try {
      const res = await api<{ room: Room }>(`/api/rooms/${room.id}/status`, { body: { status, ...extra } });
      // Apply immediately; the socket echo will simply re-apply the same values.
      setRooms((prev) => prev.map((r) => (r.id === res.room.id ? { ...r, ...res.room } : r)));
    } catch (e) {
      setError(`${room.number}: ${errorText(e, t)}`);
    } finally {
      setBusyRoomId(null);
    }
  };

  /**
   * Aufgabe C (v4): dashboard tiles (KPIs, priority banner chips) are
   * clickable and jump straight to the matching filtered board — e.g. the
   * "Blocked" tile shows only BLOCKED rooms. `null` clears the status filter
   * instead (used by tiles that summarize the whole board, e.g. progress).
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const focusStatus = (status: RoomStatus | null) => {
    setStatusFilter(status ?? "ALL");
    setFloorFilter("ALL");
    setAttendantFilter("ALL");
    setSearch("");
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * Release the whole queue in one action. Each room still passes the same
   * server-side checks, so a room someone else touched meanwhile is reported
   * rather than silently skipped.
   */
  const releaseAll = async () => {
    if (bulkBusy || releaseQueue.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setBulkResult(null);
    try {
      const res = await api<{
        changed: number;
        rejected: number;
        failed: { error: string }[];
      }>("/api/rooms/bulk-status", {
        body: { roomIds: releaseQueue.map((r) => r.id), status: "INSPECTED" },
      });
      setBulkResult(
        res.rejected === 0
          ? t("supervisor.releasedAndPushed", { count: res.changed })
          : t("supervisor.releasedPartial", { changed: res.changed, rejected: res.rejected, error: res.failed[0]?.error ?? "" })
      );
      load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBulkBusy(false);
    }
  };

  // ── D3: Anzeige-Daten für die Glas-Übersicht (nur Darstellung, Regeln in src/lib/ui/supervisorHub.ts) ──
  const kpis = useMemo(() => supervisorKpis(rooms), [rooms]);
  const creditOf = useCallback(
    (roomId: string) => {
      const r = roomById.get(roomId);
      return r ? roomCreditOf(r, laundryIds.has(r.id), creditSettings) : 0;
    },
    [roomById, laundryIds, creditSettings]
  );
  // „Team heute“ = Kräfte mit heutigen Zimmern (ohne Zimmer: nichts zu zeigen; Zuteilen nur im Grundriss).
  const roster = useMemo(() => rosterEntries(attendants, rooms, creditOf).filter((r) => r.total > 0), [attendants, rooms, creditOf]);
  const activeAttendantId = roster.some((r) => r.id === selectedAttendantId) ? selectedAttendantId : null;
  const groups = useMemo(
    () =>
      activeAttendantId
        ? roomGroups(rooms, activeAttendantId).map(({ group, rooms: list }) => ({
            group,
            tiles: list.map((r): HubTile => ({ id: r.id, number: r.number, state: tileStateOf(r), hint: t(`status.${r.status}` as TKey) })),
          }))
        : [],
    [rooms, activeAttendantId, t]
  );
  const onKpi = (k: SupKpi) => focusStatus(SUP_KPI_STATUS[k] as RoomStatus);

  const notices = (
    <>
      <GlassRedistribution />
      <HubMissingNotice hub={hub} planner />
      {ticker && <Banner tone="accent" icon="zap" title={ticker} />}
      {error && (
        <div role="alert">
          <Banner tone="warning" title={error} />
        </div>
      )}
      {bulkResult && <Banner tone="info" icon="check" title={bulkResult} />}
    </>
  );

  const release = (
    <ReleaseQueueCard
      rooms={releaseQueue.map((r) => ({
        id: r.id,
        number: r.number,
        waitingMin: Math.round((Date.now() - new Date(r.statusSince).getTime()) / 60000),
        arrival: r.arrivals[0] ?? null,
      }))}
      busyRoomId={busyRoomId}
      bulkBusy={bulkBusy}
      onRelease={(id) => { const room = roomById.get(id); if (room) void act(room, "INSPECTED"); }}
      onRework={(id) => { const room = roomById.get(id); if (room) setDialog({ kind: "rework", room }); }}
      onReleaseAll={() => void releaseAll()}
      onOpen={setSelectedId}
    />
  );

  // Weitere Bereiche unter „Team heute“ (D3b: alle im Glas-Design, Inhalt und Verhalten unverändert).
  const below = (
    <>
      {/* Dauerhafte Hinweise (Etagen-Bereich, Etage 5 geschätzt) unter „Team heute“, damit Kennzahlen und Team oben stehen (Figma) */}
      {floorScope && <Banner tone="info" icon="info" title={t("supervisor.floorScopeNotice", { floors: floorScope.join(", ") })} />}
      {HOTEL.unconfirmedFloors.length > 0 && (
        <Banner tone="warning" title={t("common.unconfirmedFloorNotice", { floors: HOTEL.unconfirmedFloors.join(", ") })} />
      )}
      <ErrorBoundary>
        <SupervisorGlance rooms={rooms} onChanged={load} />
      </ErrorBoundary>
      <PriorityBanner
        items={[
          {
            count: releaseQueue.length,
            label: t("priority.releaseQueue"),
            icon: "clock",
            tone: releaseQueue.length >= RELEASE_QUEUE_BACKLOG ? "urgent" : "watch",
            onClick: () => focusStatus("CLEAN"),
          },
          { count: blockedCount, label: t("priority.blockedRooms"), icon: "ban", tone: "urgent", onClick: () => focusStatus("BLOCKED") },
        ]}
      >
        <ErrorBoundary>
          <SupervisorFeed />
        </ErrorBoundary>
      </PriorityBanner>

      {/* Live-Board (Status-Raster): dieselben Filter und Zimmer wie bisher, im Glas-Design (D3b). */}
      <GlassCard as="section" aria-labelledby="sup-board-title" className="flex flex-col gap-4">
        <div ref={gridRef} className="scroll-mt-4">
          <h2 id="sup-board-title" className="text-title-22 text-text-primary">{t("supervisor.liveBoard")}</h2>
          <p className="text-label text-text-muted">{t("supervisor.fiveFloorsKeys", { count: rooms.length })}</p>
        </div>
        {/* Ein Zimmer unter 145 finden, ohne zu scrollen. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <Field label={t("supervisor.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("supervisor.searchPlaceholder")} type="search" />
          <GlassSelect label={t("supervisor.filterByStatus")} value={statusFilter} onChange={(v) => setStatusFilter(v as RoomStatus | "ALL")}
            options={[{ value: "ALL", label: t("supervisor.allStatuses") }, ...LEGEND.map((st) => ({ value: st, label: t(`status.${st}` as TKey) }))]} />
          <GlassSelect label={t("supervisor.filterByFloor")} value={String(floorFilter)} onChange={(v) => setFloorFilter(v === "ALL" ? "ALL" : Number(v))}
            options={[{ value: "ALL", label: t("supervisor.allFloors") }, ...[...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b).map((f) => ({ value: String(f), label: t("supervisor.floorN", { floor: f }) }))]} />
          <GlassSelect label={t("supervisor.filterByAttendant")} value={attendantFilter} onChange={setAttendantFilter}
            options={[{ value: "ALL", label: t("supervisor.anyone") }, { value: "NONE", label: t("supervisor.unassigned") }, ...attendants.map((a) => ({ value: a.id, label: attendantLabel(a) }))]} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterChip active={guestDndOnly} onClick={() => setGuestDndOnly((v) => !v)}>
            <Glyph name="moon" size={18} className="me-2" />
            {withoutLeadingSymbol(t("shared.guestDnd"))}
          </FilterChip>
          {filtersActive && (
            <>
              <span className="text-body-16 text-text-secondary">{t("supervisor.ofTotal", { visible: visible.length, total: rooms.length })}</span>
              <FilterChip
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                  setFloorFilter("ALL");
                  setAttendantFilter("ALL");
                  setGuestDndOnly(false);
                }}
              >
                <Glyph name="x" size={18} className="me-2" />
                {t("supervisor.clear")}
              </FilterChip>
            </>
          )}
        </div>
        <StatusLegend
          statuses={LEGEND}
          labelOf={(st) => t(`status.${st}` as TKey)}
          markerLabels={{ vip: t("ui.marker.vip"), here: t("supHub.staffHere"), guestDnd: withoutLeadingSymbol(t("shared.guestDnd")), notes: t("supervisor.notesTitle") }}
        />
        <div>
          {byFloor.map(([floor, floorRooms]) => (
            <Collapsible
              key={`${floor}-${filtersActive}`}
              defaultOpen={filtersActive}
              summary={
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-title-22">{t("supervisor.floorN", { floor })}</span>
                  <span className="text-label text-text-muted">
                    {t("supervisor.floorReleased", { done: floorRooms.filter((r) => r.status === "INSPECTED").length, total: floorRooms.length })}
                  </span>
                </span>
              }
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
                {floorRooms.map((room) => {
                  const attHere = attendants.find((a) => a.currentRoomId === room.id);
                  const statusLabel = t(`status.${room.status}` as TKey);
                  const sub =
                    room.status === "BLOCKED" && room.blockReason ? t(`blockReasonShort.${room.blockReason as BlockReason}` as TKey) : room.section;
                  const vip = room.arrivals.some((a) => a.vip);
                  const label = [
                    room.number,
                    statusLabel,
                    sub,
                    vip && t("ui.marker.vip"),
                    room.guestDndActive && t("shared.guestDnd"),
                    attHere && `${t("supHub.staffHere")}: ${attendantLabel(attHere)}`,
                    room.openNotesCount > 0 && `${t("supervisor.notesTitle")}: ${room.openNotesCount}`,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <StatusTile
                      key={room.id}
                      number={room.number}
                      status={room.status}
                      statusLabel={statusLabel}
                      sub={sub}
                      vip={vip}
                      guestDnd={room.guestDndActive}
                      here={!!attHere}
                      notes={room.openNotesCount}
                      busy={busyRoomId === room.id}
                      label={label}
                      onClick={() => setSelectedId(room.id)}
                    />
                  );
                })}
              </div>
            </Collapsible>
          ))}
        </div>
      </GlassCard>

      <SupervisorList />
    </>
  );

  const detailRoom = selected
    ? {
        ...selected,
        assignedLabel: selected.assignedTo ? attendantLabel(selected.assignedTo) : null,
      }
    : null;

  return (
    <div className="theme-glass">
      <SupervisorHub
        kpis={kpis}
        onKpi={onKpi}
        roster={roster}
        selectedAttendantId={activeAttendantId}
        onSelectAttendant={(id) => setSelectedAttendantId((cur) => (cur === id ? null : id))}
        groups={groups}
        selectedRoomId={selectedId}
        onOpenRoom={setSelectedId}
        onMoveRooms={() => router.push("/floor-plan")}
        notices={notices}
        release={release}
        below={below}
        detailOpen={!!detailRoom}
        detail={
          <DetailContainer open={!!detailRoom} onClose={() => setSelectedId(null)} title={detailRoom ? t("hkHub.roomTitle", { n: detailRoom.number }) : ""}>
            {detailRoom && (
              <SupervisorRoomDetail
                key={detailRoom.id}
                room={detailRoom}
                busy={busyRoomId === detailRoom.id}
                isDutyManager={isDutyManager}
                onAct={(status) => void act(detailRoom, status)}
                onOpenDialog={(kind) => setDialog({ kind, room: detailRoom })}
                thread={
                  <HkNoteThread
                    roomId={detailRoom.id}
                    initialNotes={detailRoom.notes}
                    onNoteAdded={(note: ThreadNote) =>
                      setRooms((prev) =>
                        prev.map((r) =>
                          r.id === note.roomId ? { ...r, notes: [note as Note, ...r.notes].slice(0, 3), openNotesCount: r.openNotesCount + 1 } : r
                        )
                      )
                    }
                    onNoteUpdated={(note: ThreadNote) => {
                      setRooms((prev) =>
                        prev.map((r) => (r.id === note.roomId ? { ...r, notes: r.notes.map((n) => (n.id === note.id ? (note as Note) : n)) } : r))
                      );
                      refetchSoon();
                    }}
                  />
                }
              />
            )}
          </DetailContainer>
        }
      />

      {dialog?.kind === "rework" && (
        <ReworkDialog
          number={dialog.room.number}
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            setDialog(null);
            await act(dialog.room, "PICKUP", { note });
          }}
        />
      )}
      {dialog?.kind === "ooo" && (
        <OooDialog
          number={dialog.room.number}
          onClose={() => setDialog(null)}
          onSubmit={async (until) => {
            setDialog(null);
            await act(dialog.room, "OUT_OF_ORDER", { oooUntil: until.toISOString() });
          }}
        />
      )}
      {dialog?.kind === "roomTask" && (
        <RoomTaskModal
          room={dialog.room}
          onClose={() => setDialog(null)}
          onSubmit={async (payload) => {
            setDialog(null);
            await api("/api/roomtasks", { body: { roomId: dialog.room.id, ...payload } });
          }}
        />
      )}
    </div>
  );
}
