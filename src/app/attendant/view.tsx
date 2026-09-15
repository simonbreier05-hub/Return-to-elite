"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, NetworkError, api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import OfflineBar from "@/components/OfflineBar";
import Modal from "@/components/Modal";
import Collapsible from "@/components/Collapsible";
import DragReorderList from "@/components/DragReorderList";
import WindowPanel from "@/components/WindowPanel";
import { type ThreadNote } from "@/components/NoteThread";
import PriorityBanner from "@/components/PriorityBanner";
import NotificationsPanel from "@/components/NotificationsPanel";
import NoteCountBadge from "@/components/NoteCountBadge";
import { RoomFlagIcons } from "@/components/RoomFlags";
import RoomDetailModal, { type RoomDetailActions } from "@/components/RoomDetailModal";
import { StatusIcon } from "@/components/icons";
import { STATUS_STYLES } from "@/components/status";
import { BLOCK_REASONS, DEFECT_CATEGORIES, type NoteStatus, type RoomStatus } from "@/lib/domain";
import { chunkByFloor, defaultRouteOrder, routeLoadLabel, TYPICAL_DAILY_ROOMS } from "@/lib/assignment/routeOrder";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

/**
 * The single next status in the attendant's restricted linear chain for the
 * "Meine Zimmer" window's "Status weiterschalten" button. Deliberately
 * narrower than the full LEGAL_TRANSITIONS table (which also allows
 * PICKUP/BLOCKED/etc.) — this only serves "keep tapping to advance", and it
 * never proposes INSPECTED. The server enforces that independently anyway
 * (src/lib/stateMachine.ts ROLE_ALLOWED_TARGETS.room_attendant excludes it),
 * so this is a UI convenience on top of an existing hard guarantee, not a
 * substitute for it.
 */
function nextAttendantStatus(status: RoomStatus): RoomStatus | null {
  if (status === "DIRTY") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "CLEAN";
  return null;
}

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
  reworkNote?: string | null;
  blockReason?: string | null;
  oooUntil?: string | null;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  routeOrder?: number | null;
  openNotesCount: number;
  assignedTo?: { id: string; name: string } | null;
  arrivals: { guestName: string; eta?: string | null; vip: boolean; neededNow: boolean }[];
  defects: { id: string; category: string; note: string; workOrder?: { status: string } | null }[];
  notes: Note[];
}

interface Priority {
  roomId: string;
  score: number;
  reasons: { signal: string; points: number; reason: string }[];
  estimatedMinutes: number;
}

export default function AttendantView() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});
  const [modal, setModal] = useState<{ kind: "block" | "defect"; room: Room } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  /** The one room whose full detail (why, notes, defect report, block…) is open right now — the
   * Housekeeper-Hub's focus mode keeps every card minimal and pushes everything else in here. */
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null);
  const offline = useOfflineQueue();

  const loadRooms = useCallback(async () => {
    const data = await api<{ rooms: Room[] }>("/api/rooms?mine=1");
    setRooms(data.rooms);
  }, []);

  /** Priority is computed server-side, so it cannot be patched from an event. */
  const loadPriorities = useCallback(async () => {
    const data = await api<{ priorities: Priority[] }>("/api/priority");
    setPriorities(Object.fromEntries(data.priorities.map((p) => [p.roomId, p])));
  }, []);

  useEffect(() => {
    loadRooms();
    loadPriorities();
  }, [loadRooms, loadPriorities]);

  const refreshPrioritiesSoon = useCoalescedRefetch(loadPriorities, 2000);
  const refreshRoomsSoon = useCoalescedRefetch(loadRooms, 2000);

  useSocket({
    "room:update": (p: { room: Room }) => {
      setRooms((prev) => {
        if (!prev.some((r) => r.id === p.room.id)) {
          // Not one of my rooms yet — it may have just been assigned to me.
          refreshRoomsSoon();
          return prev;
        }
        return prev.map((r) => (r.id === p.room.id ? { ...r, ...p.room } : r));
      });
      refreshPrioritiesSoon();
      // A supervisor moving this room to a different attendant (roster's
      // "move to…") means it may no longer be mine — the coalesced refetch
      // is the only place that actually drops it from ?mine=1.
      refreshRoomsSoon();
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
      refreshRoomsSoon();
    },
  });

  const setStatus = async (room: Room, status: RoomStatus, extra: Record<string, unknown> = {}) => {
    if (busyRoomId) return; // one tap at a time; prevents a double tap firing twice
    setBusyRoomId(room.id);
    setError(null);
    const url = `/api/rooms/${room.id}/status`;
    const body = { status, ...extra };
    try {
      const res = await api<{ room: Room }>(url, { body });
      setRooms((prev) => prev.map((r) => (r.id === res.room.id ? { ...r, ...res.room } : r)));
      refreshPrioritiesSoon();
    } catch (e) {
      if (e instanceof NetworkError) {
        // Dead spot. Keep the tap, show the new status locally, deliver later.
        // The attendant carries on; the queue replays in order when signal
        // returns, and the offline bar reports anything the server refuses.
        offline.enqueue({ url, body, label: `${room.number} · ${t(`status.${status}` as TKey)}` });
        setRooms((prev) =>
          prev.map((r) =>
            r.id === room.id
              ? { ...r, status, blockReason: status === "BLOCKED" ? String(extra.blockReason ?? "") : r.blockReason }
              : r
          )
        );
      } else {
        setError(`${room.number}: ${e instanceof ApiError ? e.message : String(e)}`);
      }
    } finally {
      setBusyRoomId(null);
    }
  };

  const byPriority = useCallback(
    (a: Room, b: Room) => (priorities[b.id]?.score ?? -1) - (priorities[a.id]?.score ?? -1),
    [priorities]
  );

  /**
   * Grouped by floor, because that is how the work is actually walked — you
   * finish a floor before taking the stairs. Within a floor the most urgent
   * room comes first.
   */
  const floors = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const room of rooms) {
      if (!map.has(room.floor)) map.set(room.floor, []);
      map.get(room.floor)!.push(room);
    }
    for (const list of map.values()) list.sort(byPriority);
    return [...map.entries()]
      .sort((a, b) => {
        // Floors with the most urgent room first, so the next stop is obvious.
        const topA = priorities[a[1][0]?.id]?.score ?? -1;
        const topB = priorities[b[1][0]?.id]?.score ?? -1;
        return topB - topA || a[0] - b[0];
      });
  }, [rooms, byPriority, priorities]);

  const done = rooms.filter((r) => r.status === "INSPECTED").length;
  const openCount = rooms.filter((r) => ["DIRTY", "PICKUP", "BLOCKED"].includes(r.status)).length;

  /**
   * "What's important now": rooms a guest or front office is actively
   * waiting on (needed-now / VIP), and BLOCKED rooms that have aged past at
   * least one re-check interval — both drawn straight from the same
   * explainable priority signals the "why?" panel already shows, so the
   * banner and the per-room reasoning never disagree with each other.
   */
  const urgentCount = useMemo(
    () => rooms.filter((r) => priorities[r.id]?.reasons.some((rs) => rs.signal === "needed_now" || rs.signal === "vip")).length,
    [rooms, priorities]
  );
  const agingBlockedCount = useMemo(
    () =>
      rooms.filter((r) => r.status === "BLOCKED" && priorities[r.id]?.reasons.some((rs) => rs.signal === "blocked_age")).length,
    [rooms, priorities]
  );

  /**
   * The Laufplan: every room actually worth a visit today (the same set the
   * priority feed serves — a housekeeping-relevant room with a still-open
   * status), in the order to walk them. A persisted routeOrder wins — it was
   * either set when the morning plan was applied (priority + floor/section
   * walking order, already calculated) or by a previous drag. Anything
   * without one yet (assigned outside a plan, e.g. via the board) falls back
   * to the same calculation, live.
   */
  const routeRooms = useMemo(() => {
    const eligible = rooms.filter((r) => priorities[r.id]);
    const ordered = eligible.filter((r) => r.routeOrder != null).sort((a, b) => a.routeOrder! - b.routeOrder!);
    const unordered = defaultRouteOrder(
      eligible
        .filter((r) => r.routeOrder == null)
        .map((r) => ({ id: r.id, number: r.number, floor: r.floor, section: r.section, priorityScore: priorities[r.id]?.score ?? 0 }))
    );
    const byId = new Map(eligible.map((r) => [r.id, r]));
    return [...ordered.map((r) => r.id), ...unordered.map((r) => r.id)].map((id) => byId.get(id)!);
  }, [rooms, priorities]);

  const routeChunks = useMemo(() => chunkByFloor(routeRooms), [routeRooms]);
  const routeLoad = routeLoadLabel(routeRooms.length);

  const detailRoom = rooms.find((r) => r.id === detailRoomId) ?? null;

  /**
   * Everything a minimized room card no longer shows inline — why it's
   * prioritized, the primary status action, block/defect entry points, and
   * a fully writable note thread — assembled for RoomDetailModal. Block and
   * defect stay their own overlay (multipart photo upload, preset reasons),
   * opened on top once the detail modal steps aside.
   */
  const buildDetailActions = (room: Room): RoomDetailActions => {
    const next = nextAttendantStatus(room.status);
    const canBlock = ["DIRTY", "IN_PROGRESS", "PICKUP"].includes(room.status);
    const prio = priorities[room.id];
    return {
      primary:
        room.status === "BLOCKED"
          ? { label: t("attendant.unblockAndStart"), onClick: () => setStatus(room, "IN_PROGRESS") }
          : next
            ? { label: next === "IN_PROGRESS" ? t("attendant.startCleaning") : t("attendant.markClean"), onClick: () => setStatus(room, next) }
            : null,
      busy: busyRoomId === room.id,
      priority: prio,
      onBlock: canBlock ? () => { setDetailRoomId(null); setModal({ kind: "block", room }); } : undefined,
      onReportDefect: () => { setDetailRoomId(null); setModal({ kind: "defect", room }); },
      onNoteAdded: (note: ThreadNote) =>
        setRooms((prev) =>
          prev.map((r) => (r.id === room.id ? { ...r, notes: [note, ...r.notes].slice(0, 3), openNotesCount: r.openNotesCount + 1 } : r))
        ),
      onNoteUpdated: (note: ThreadNote) => {
        setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: r.notes.map((n) => (n.id === note.id ? note : n)) } : r)));
        refreshRoomsSoon();
      },
    };
  };

  /**
   * "erledigt" for the Meine Zimmer window = cleaned OR released — distinct
   * from `done` above, which counts only INSPECTED for the existing header
   * stat line.
   */
  const doneForWindow = routeRooms.filter((r) => r.status === "CLEAN" || r.status === "INSPECTED").length;

  /** One floor-chunk was locally reordered — splice it back into the full sequence and persist. */
  const reorderChunk = async (chunkIndex: number, newChunkItems: Room[]) => {
    const nextChunks = routeChunks.map((c, i) => (i === chunkIndex ? { ...c, items: newChunkItems } : c));
    const newOrder = nextChunks.flatMap((c) => c.items).map((r) => r.id);
    const orderIndex = new Map(newOrder.map((id, idx) => [id, idx]));
    setRooms((prev) => prev.map((r) => (orderIndex.has(r.id) ? { ...r, routeOrder: orderIndex.get(r.id)! } : r)));
    try {
      await api("/api/rooms/reorder", { method: "PATCH", body: { roomIds: newOrder } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the new order.");
      loadRooms();
    }
  };

  return (
    <div className="animate-rise">
      <div className="mb-5">
        <h2 className="font-serif text-4xl leading-none">{t("attendant.myRooms")}</h2>
        <div className="rule-gold my-2 w-40" />
        <p className="text-sm text-graphite/70">
          {t("attendant.stillToDo", { count: openCount })} · {t("attendant.releasedOfTotal", { done, total: rooms.length })} ·{" "}
          {t("attendant.mostUrgentFirst")}
        </p>
      </div>

      <PriorityBanner
        items={[
          { count: urgentCount, label: t("priority.urgentRooms"), icon: "warning", tone: "urgent" },
          { count: agingBlockedCount, label: t("priority.blockedNeedsRecheck"), icon: "ban", tone: "urgent" },
        ]}
      />

      <NotificationsPanel targetRole="room_attendant" />

      <OfflineBar state={offline} />

      {/*
       * Focus mode: "Meine Zimmer" is the Housekeeper-Hub's default view —
       * just the room list plus the messages panel above. Every row stays
       * to number, status, the occupancy/checkout flags and a note badge;
       * everything else (why this room is prioritized, notes, defect
       * report, block) lives one tap away in RoomDetailModal.
       */}
      <WindowPanel
        title="Meine Zimmer"
        right={
          <span className="text-xs text-graphite/60">
            {doneForWindow} von {routeRooms.length} erledigt
          </span>
        }
      >
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-parchment">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${routeRooms.length ? Math.round((doneForWindow / routeRooms.length) * 100) : 0}%` }}
          />
        </div>
        {routeRooms.length === 0 && <p className="text-sm text-graphite/60">Noch keine Zimmer zugewiesen.</p>}
        <div className="space-y-1.5">
          {routeRooms.map((room) => {
            const style = STATUS_STYLES[room.status];
            return (
              <button
                type="button"
                key={room.id}
                onClick={() => setDetailRoomId(room.id)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg border border-charcoal/10 border-l-4 bg-white px-3 py-2.5 text-left ${style.border}`}
              >
                <span className="font-serif text-lg">{room.number}</span>
                <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${style.chip}`}>
                  <StatusIcon iconKey={style.iconKey} className="h-3 w-3 shrink-0" />
                  {t(`status.${room.status}` as TKey)}
                </span>
                <RoomFlagIcons occupancy={room.occupancy} isCheckoutToday={room.isCheckoutToday} badgeClassName="h-4 w-4" iconClassName="h-2.5 w-2.5" />
                {room.status === "INSPECTED" && <span title="Bereits freigegeben">🔒</span>}
                <NoteCountBadge openCount={room.openNotesCount} totalCount={room.notes.length} />
                <svg className="ml-auto h-4 w-4 shrink-0 text-graphite/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })}
        </div>
      </WindowPanel>

      {error && (
        <div className="mb-4 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 p-3 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      {routeRooms.length > 0 && (
        <Collapsible
          defaultOpen
          summary={
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-serif text-2xl">{t("attendant.recommendedRoute")}</h3>
              <span className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">
                {t("attendant.roomsToday", { count: routeRooms.length })}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider ${
                  routeLoad === "heavy"
                    ? "bg-gold/15 text-gold-soft"
                    : routeLoad === "typical"
                      ? "bg-status-clean/10 text-status-clean"
                      : "bg-parchment text-graphite/70"
                }`}
              >
                {routeLoad === "heavy"
                  ? t("attendant.aboveTypical", { low: TYPICAL_DAILY_ROOMS.low, high: TYPICAL_DAILY_ROOMS.high })
                  : t("attendant.typicalDay", { low: TYPICAL_DAILY_ROOMS.low, high: TYPICAL_DAILY_ROOMS.high })}
              </span>
            </div>
          }
        >
          <p className="mb-3 text-xs text-graphite/60">{t("attendant.routeExplain")}</p>
          <div className="space-y-2">
            {routeChunks.map((chunk, chunkIdx) => {
              const startIndex = routeChunks.slice(0, chunkIdx).reduce((n, c) => n + c.items.length, 0);
              return (
                <Collapsible
                  key={`${chunk.floor}-${chunkIdx}`}
                  defaultOpen={chunkIdx === 0}
                  summary={
                    <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">
                      {t("attendant.floorStops", { floor: chunk.floor, from: startIndex + 1, to: startIndex + chunk.items.length })}
                    </div>
                  }
                >
                  <DragReorderList
                    items={chunk.items}
                    getId={(r) => r.id}
                    onReorder={(next) => reorderChunk(chunkIdx, next)}
                    className="space-y-1.5"
                    renderItem={(room, i, handle) => {
                      const style = STATUS_STYLES[room.status];
                      const prio = priorities[room.id];
                      return (
                        <div className="flex items-center gap-2 rounded-lg border border-charcoal/10 bg-white px-2.5 py-2">
                          <button
                            {...handle}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t("attendant.dragToReorder", { number: room.number })}
                            className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-graphite/40 hover:bg-parchment active:cursor-grabbing"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                              <circle cx="4" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" />
                              <circle cx="4" cy="7" r="1.3" /><circle cx="10" cy="7" r="1.3" />
                              <circle cx="4" cy="11" r="1.3" /><circle cx="10" cy="11" r="1.3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailRoomId(room.id)}
                            className="flex min-h-11 flex-1 flex-wrap items-center gap-2 rounded-lg py-1 text-left"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-ivory tabular-nums">
                              {startIndex + i + 1}
                            </span>
                            <span className="font-serif text-lg">{room.number}</span>
                            <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${style.chip}`}>
                              <StatusIcon iconKey={style.iconKey} className="h-3 w-3 shrink-0" />
                              {t(`status.${room.status}` as TKey)}
                            </span>
                            <RoomFlagIcons occupancy={room.occupancy} isCheckoutToday={room.isCheckoutToday} badgeClassName="h-4 w-4" iconClassName="h-2.5 w-2.5" />
                            <NoteCountBadge openCount={room.openNotesCount} totalCount={room.notes.length} />
                            {prio && <span className="ml-auto text-xs text-graphite/50">{prio.score}</span>}
                          </button>
                        </div>
                      );
                    }}
                  />
                </Collapsible>
              );
            })}
          </div>
        </Collapsible>
      )}

      {floors.map(([floor, floorRooms], floorIdx) => (
        <Collapsible
          key={floor}
          defaultOpen={floorIdx === 0}
          summary={
            <div className="flex items-baseline gap-3">
              <h3 className="font-serif text-2xl">{t("attendant.floor", { floor })}</h3>
              <span className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">
                {t("attendant.doneOfTotal", { done: floorRooms.filter((r) => r.status === "INSPECTED").length, total: floorRooms.length })}
              </span>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {floorRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                busy={busyRoomId === room.id}
                onSetStatus={setStatus}
                onOpenDetail={() => setDetailRoomId(room.id)}
              />
            ))}
          </div>
        </Collapsible>
      ))}

      {rooms.length === 0 && (
        <p className="rounded-2xl border border-charcoal/10 bg-linen p-8 text-center text-graphite/60 shadow-card">
          {t("attendant.noRoomsAssigned")}
        </p>
      )}

      {detailRoom && (
        <RoomDetailModal
          room={detailRoom}
          onClose={() => setDetailRoomId(null)}
          actions={buildDetailActions(detailRoom)}
        />
      )}

      {modal?.kind === "block" && (
        <BlockModal
          room={modal.room}
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            const room = modal.room;
            setModal(null);
            await setStatus(room, "BLOCKED", { blockReason: reason });
          }}
        />
      )}
      {modal?.kind === "defect" && (
        <DefectModal
          room={modal.room}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            loadRooms();
          }}
        />
      )}
    </div>
  );
}

/**
 * One room card, minimized for the Housekeeper-Hub's focus mode: room
 * number, type, the occupancy/checkout flags, status, and a note badge —
 * plus the single next action (start cleaning / mark clean / unblock),
 * which stays big and always visible as the 90% case, one tap. Everything
 * else (why this room is prioritized, block, defect, the full note thread)
 * lives one tap away in RoomDetailModal, opened by tapping the card itself.
 */
function RoomCard({
  room,
  busy,
  onSetStatus,
  onOpenDetail,
}: {
  room: Room;
  busy: boolean;
  onSetStatus: (room: Room, status: RoomStatus) => void;
  onOpenDetail: () => void;
}) {
  const { t } = useLocale();
  const style = STATUS_STYLES[room.status];
  const next = nextAttendantStatus(room.status);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpenDetail()}
      className={`rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm transition ${busy ? "opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="font-serif text-3xl">{room.number}</span>
          <span className="ml-2 text-xs uppercase tracking-wider text-graphite/50">{t(`roomType.${room.type}` as TKey)}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${style.chip}`}>
            <StatusIcon iconKey={style.iconKey} className="h-3.5 w-3.5 shrink-0" />
            {t(`status.${room.status}` as TKey)}
          </span>
          <div className="flex items-center gap-1">
            <RoomFlagIcons occupancy={room.occupancy} isCheckoutToday={room.isCheckoutToday} />
            <NoteCountBadge openCount={room.openNotesCount} totalCount={room.notes.length} />
          </div>
        </div>
      </div>

      {next && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetStatus(room, next);
          }}
          disabled={busy}
          className="h-14 w-full rounded-xl bg-status-in-progress text-lg font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : next === "IN_PROGRESS" ? t("attendant.startCleaning") : t("attendant.markClean")}
        </button>
      )}
      {room.status === "BLOCKED" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetStatus(room, "IN_PROGRESS");
          }}
          disabled={busy}
          className="h-14 w-full rounded-xl bg-status-in-progress text-lg font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : t("attendant.unblockAndStart")}
        </button>
      )}
    </div>
  );
}

function BlockModal({
  room,
  onClose,
  onSubmit,
}: {
  room: { number: string };
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useLocale();
  const labels: Record<string, TKey> = {
    DND: "attendant.blockReasonDnd",
    GUEST_IN_ROOM: "attendant.blockReasonGuest",
    DOUBLE_LOCKED: "attendant.blockReasonLocked",
    REFUSED: "attendant.blockReasonRefused",
  };
  return (
    <Modal
      title={t("attendant.blockModalTitle", { number: room.number })}
      subtitle={t("attendant.blockModalSubtitle")}
      onClose={onClose}
    >
      <div className="grid gap-2">
        {BLOCK_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => onSubmit(r)}
            className="h-14 rounded-xl border-2 border-status-blocked/60 text-base font-medium text-status-blocked hover:bg-status-blocked/10"
          >
            {t(labels[r])}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DefectModal({
  room,
  onClose,
  onDone,
}: {
  room: { id: string; number: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const [category, setCategory] = useState<string>("PLUMBING");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("category", category);
      fd.set("note", note);
      if (photo) fd.set("photo", photo);
      await api(`/api/rooms/${room.id}/defects`, { formData: fd });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("attendant.defectModalTitle", { number: room.number })} subtitle={t("attendant.defectModalSubtitle")} onClose={onClose}>
      <label className="mb-1 block text-sm font-medium">{t("attendant.category")}</label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {DEFECT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`h-11 rounded-lg border text-sm ${
              category === c ? "border-gold bg-parchment font-semibold" : "border-charcoal/15"
            }`}
          >
            {t(`defectCategory.${c}` as TKey)}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium">{t("attendant.description")}</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mb-3 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
        placeholder={t("attendant.descriptionPlaceholder")}
      />
      <label className="mb-1 block text-sm font-medium">
        {t("attendant.photoOptional")} ({t("common.optional")})
      </label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mb-4 w-full text-sm"
      />
      {error && <p className="mb-2 text-sm text-status-out-of-order">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !note.trim()}
        className="h-14 w-full rounded-xl bg-status-defect text-lg font-semibold text-linen disabled:opacity-40"
      >
        {busy ? t("attendant.sending") : t("attendant.sendToEngineering")}
      </button>
    </Modal>
  );
}

