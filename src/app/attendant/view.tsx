"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HubMoreMenu from "@/components/HubMoreMenu";
import { ApiError, NetworkError, api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import OfflineBar from "@/components/OfflineBar";
import Modal from "@/components/Modal";
import Collapsible from "@/components/Collapsible";
import MyWorkData from "@/components/lists/MyWorkData";
import MyFloorsToday from "@/components/lists/MyFloorsToday";
import DragReorderList from "@/components/DragReorderList";
import ErrorBoundary from "@/components/ErrorBoundary";
import { type ThreadNote } from "@/components/NoteThread";
import PriorityBanner from "@/components/PriorityBanner";
import NotificationsPanel from "@/components/NotificationsPanel";
import NoteCountBadge from "@/components/NoteCountBadge";
import PauseControl, { type PauseInfo } from "@/components/PauseControl";
import RoomDetailModal, { type RoomDetailActions } from "@/components/RoomDetailModal";
import RoomRowView, { type ListRoom } from "@/components/lists/RoomRowView";
import RoomDayInfo from "@/components/lists/RoomDayInfo";
import { IconBellSlash } from "@/components/icons";
import { BLOCK_REASONS, DEFECT_CATEGORIES, type NoteStatus, type RoomStatus } from "@/lib/domain";
import { chunkByFloor, routeLoadLabel, TYPICAL_DAILY_ROOMS } from "@/lib/assignment/routeOrder";
import { ACTION_TARGET, floorProgress, hkGroupOf, orderRoute, primaryActionFor, type HkAction, type HkGroup } from "@/lib/rooms/hkGroups";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import { hhmm } from "@/lib/i18n/format";

interface Note {
  id: string;
  body: string;
  status: NoteStatus;
  kind?: string;
  author: { name: string; role: string };
  createdAt: string;
  roomId?: string;
}

/** Zimmer aus GET /api/rooms?mine=1 (Status, Notizen, Mängel, Gastwünsche, Pause, Zurückspulen). */
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
  /** Open guest "Bitte nicht stören" request (Prompt G2 Teil 4) — never Room.status/blockReason. */
  guestDndActive?: boolean;
  guestRequests?: { id: string; kind: string; detail: string | null; status: string; createdAt: string }[];
  pause?: PauseInfo | null;
  rewind?: { to: string; until: string } | null;
}

/** Tagesliste aus GET /api/lists/housekeeper (Art, Wäsche, VIP, Gast-Kurzname, Traces, Credits, Fortschritt). */
interface HkList {
  date: string | null;
  progress: { done: number; total: number; creditsDone: number; creditsTotal: number };
  rooms: ListRoom[];
}

interface Priority {
  roomId: string;
  score: number;
  reasons: { signal: string; points: number; reason: string }[];
  estimatedMinutes: number;
}

const ACTION_LABEL: Record<Exclude<HkAction, null | "DND">, TKey> = {
  START: "attendant.startCleaning", FINISH: "attendant.markClean", UNBLOCK: "attendant.unblockAndStart", RESUME: "work.resume",
};
const GROUP_TITLE: Record<HkGroup, TKey> = { NOW: "hkHub.groupNow", NEXT: "hkHub.groupNext", DONE: "hkHub.groupDone", OTHER: "hkHub.groupOther" };
const time = (iso: string) => hhmm(iso);

/**
 * Housekeeper-Hub „Meine Zimmer“ — eine Ansicht statt „Meine Liste“ + „Meine Zimmer“: der ruhige Listen-Look (Art, Wäsche,
 * VIP, Gast-Kurzname, Traces, Credits, Fortschritt) mit den Funktionen von „Meine Zimmer“ (Ein-Tipp-Start/Fertig, Gruppen
 * nach Status, empfohlene Route mit Ziehen zum Sortieren, Prioritätssprung, DND-Hinweis). Jedes Zimmer öffnet das gemeinsame
 * Zimmer-Detail-Modal; dort auch Pausieren (mit Grund), Fortsetzen, Zurückspulen und Nachrichten.
 * Daten: /api/rooms?mine=1 + /api/lists/housekeeper + /api/priority, live per Socket.IO. Unvollständige Antworten crashen nicht.
 */
export default function AttendantView() {
  const { t } = useLocale();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [list, setList] = useState<HkList | null>(null);
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});
  const [modal, setModal] = useState<{ kind: "block" | "defect"; room: Room } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offline = useOfflineQueue();

  const [hub, setHub] = useState<HubState | null>(null);
  const loadRooms = useCallback(async () => {
    const data = await api<{ rooms?: Room[]; hub?: HubState }>("/api/rooms?mine=1");
    setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    setHub(data.hub ?? null);
  }, []);
  const loadList = useCallback(async () => {
    const d = await api<HkList>("/api/lists/housekeeper").catch(() => null);
    setList(d && Array.isArray(d.rooms) ? d : null);
  }, []);
  /** Priority is computed server-side, so it cannot be patched from an event. */
  const loadPriorities = useCallback(async () => {
    const data = await api<{ priorities?: Priority[] }>("/api/priority").catch(() => null);
    setPriorities(Object.fromEntries((data?.priorities ?? []).map((p) => [p.roomId, p])));
  }, []);

  useEffect(() => {
    loadRooms().catch((e) => setError(errorText(e, t)));
    void loadList();
    void loadPriorities();
  }, [loadRooms, loadList, loadPriorities]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const refreshPrioritiesSoon = useCoalescedRefetch(loadPriorities, 2000);
  const refreshRoomsSoon = useCoalescedRefetch(() => loadRooms().catch(() => {}), 1500);
  const refreshListSoon = useCoalescedRefetch(loadList, 1500);
  const refreshAll = () => { refreshRoomsSoon(); refreshListSoon(); refreshPrioritiesSoon(); };

  useSocket({
    "dayplan:updated": (p: { changedRooms?: string[] } | undefined) => {
      refreshAll();
      if (p?.changedRooms?.length) {
        setFlash(new Set(p.changedRooms));
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(new Set()), 3500);
      }
    },
    "assignments:applied": () => refreshAll(),
    "room:update": (p: { room?: Room } | undefined) => {
      const changed = p?.room;
      if (changed?.id) setRooms((prev) => prev.map((r) => (r.id === changed.id ? { ...r, ...changed, notes: r.notes, defects: r.defects, arrivals: r.arrivals } : r)));
      // Ein Zimmer kann mir gerade zugeteilt oder weggenommen worden sein — nur das Nachladen über ?mine=1 weiß das sicher.
      refreshAll();
    },
    "trace:update": () => refreshListSoon(),
    "work:pause": () => refreshRoomsSoon(),
    "note:new": (p: { note?: Note } | undefined) => {
      const note = p?.note;
      if (!note?.roomId) return;
      setRooms((prev) => prev.map((r) => (r.id === note.roomId ? { ...r, notes: [note, ...(r.notes ?? [])].slice(0, 3), openNotesCount: (r.openNotesCount ?? 0) + 1 } : r)));
    },
    // A toggle may land on a note outside the 3-item preview window, so the
    // preview is patched directly for instant feedback but openNotesCount —
    // an aggregate over the *full* thread — is left to the coalesced refetch.
    "note:update": (p: { note?: Note } | undefined) => {
      const note = p?.note;
      if (!note?.roomId) return;
      setRooms((prev) => prev.map((r) => (r.id === note.roomId ? { ...r, notes: (r.notes ?? []).map((n) => (n.id === note.id ? note : n)) } : r)));
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
      setRooms((prev) => prev.map((r) => (r.id === res.room.id ? { ...r, ...res.room, notes: r.notes, defects: r.defects, arrivals: r.arrivals } : r)));
      refreshAll(); // Fortschritt, Pause-Ende und „Rückgängig“-Angebot kommen vom Server
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
        setError(`${room.number}: ${errorText(e, t)}`);
      }
    } finally {
      setBusyRoomId(null);
    }
  };

  const resume = async (room: Room) => {
    if (busyRoomId) return;
    setBusyRoomId(room.id); setError(null);
    try {
      await api("/api/work/pause", { body: { targetType: "ROOM", targetId: room.id, action: "resume" } });
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, pause: null } : r)));
      refreshRoomsSoon();
    } catch (e) {
      setError(`${room.number}: ${errorText(e, t)}`);
    } finally {
      setBusyRoomId(null);
    }
  };

  const rewind = async (room: Room) => {
    if (busyRoomId) return;
    setBusyRoomId(room.id); setError(null);
    try {
      const res = await api<{ room: Room }>(`/api/rooms/${room.id}/rewind`, { body: {} });
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, ...res.room, notes: r.notes, defects: r.defects, arrivals: r.arrivals, rewind: null } : r)));
      refreshAll();
    } catch (e) {
      setError(`${room.number}: ${errorText(e, t)}`);
      refreshRoomsSoon();
    } finally {
      setBusyRoomId(null);
    }
  };

  const dayById = useMemo(() => new Map((list?.rooms ?? []).map((r) => [r.id, r])), [list]);
  const isDnd = (r: Room) => !!r.guestDndActive;
  const actionFor = (r: Room) => primaryActionFor(r.status, { guestDnd: isDnd(r), paused: !!r.pause });

  const runAction = (room: Room, action: HkAction) => {
    if (action === "RESUME") return void resume(room);
    const to = action ? ACTION_TARGET[action] : undefined;
    if (to) void setStatus(room, to as RoomStatus);
  };

  /** Zeile im Listen-Look: Tagesdaten aus der Liste, Status/Pause/Notizen live aus dem Board. */
  const asListRoom = (r: Room): ListRoom => {
    const d = dayById.get(r.id);
    return {
      id: r.id, number: r.number, floor: r.floor, status: r.status,
      kind: d?.kind ?? null, laundry: !!d?.laundry, vip: !!d?.vip || (r.arrivals ?? []).some((a) => a.vip), eta: d?.eta ?? null,
      guest: d?.guest ?? null, pax: d?.pax ?? null, dnd: !!d?.dnd || isDnd(r), credits: d?.credits ?? 0,
      traces: Array.isArray(d?.traces) ? d!.traces : [], pause: r.pause ?? null,
    };
  };

  const score = useCallback((id: string) => priorities[id]?.score ?? 0, [priorities]);
  const groups = useMemo(() => {
    const by: Record<HkGroup, Room[]> = { NOW: [], NEXT: [], DONE: [], OTHER: [] };
    for (const r of rooms) by[hkGroupOf(r.status)].push(r);
    return { NOW: orderRoute(by.NOW, score), NEXT: orderRoute(by.NEXT, score), DONE: by.DONE, OTHER: by.OTHER };
  }, [rooms, score]);
  const routeChunks = useMemo(() => chunkByFloor(groups.NEXT), [groups.NEXT]);
  const routeLoad = routeLoadLabel(groups.NOW.length + groups.NEXT.length + groups.DONE.length);

  // Fortschritt wie in „Meine Liste“ (Zimmer + Credits aus der Tagesliste); ohne Liste aus den Zimmern selbst.
  const progress = list?.progress ?? { done: groups.DONE.length, total: rooms.length - groups.OTHER.length, creditsDone: 0, creditsTotal: 0 };
  const perFloor = useMemo(() => floorProgress(rooms), [rooms]);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  /** „Was ist jetzt wichtig“: Gast/Front Office wartet (needed-now/VIP) bzw. lange gesperrt — Prioritätssprung zum dringendsten. */
  const urgent = useMemo(
    () => rooms.filter((r) => hkGroupOf(r.status) !== "DONE" && priorities[r.id]?.reasons?.some((rs) => rs.signal === "needed_now" || rs.signal === "vip"))
      .sort((a, b) => score(b.id) - score(a.id)),
    [rooms, priorities, score]
  );
  const agingBlocked = useMemo(
    () => rooms.filter((r) => r.status === "BLOCKED" && priorities[r.id]?.reasons?.some((rs) => rs.signal === "blocked_age")),
    [rooms, priorities]
  );
  const jumpTo = (room: Room | undefined) => {
    if (!room) return;
    document.querySelector(`[data-room="${room.number}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setDetailRoomId(room.id);
  };
  const topOpen = [...groups.NOW, ...groups.NEXT].sort((a, b) => score(b.id) - score(a.id))[0];

  /** Ein Abschnitt der Route wurde per Ziehen umsortiert — in die ganze offene Reihenfolge zurücksetzen und speichern. */
  const reorderChunk = async (chunkIndex: number, newChunkItems: Room[]) => {
    const nextChunks = routeChunks.map((c, i) => (i === chunkIndex ? { ...c, items: newChunkItems } : c));
    const newOrder = nextChunks.flatMap((c) => c.items).map((r) => r.id);
    const orderIndex = new Map(newOrder.map((id, idx) => [id, idx]));
    setRooms((prev) => prev.map((r) => (orderIndex.has(r.id) ? { ...r, routeOrder: orderIndex.get(r.id)! } : r)));
    try {
      await api("/api/rooms/reorder", { method: "PATCH", body: { roomIds: newOrder } });
    } catch (e) {
      setError(errorText(e, t, "shared.reorderFailed"));
      void loadRooms();
    }
  };

  const detailRoom = rooms.find((r) => r.id === detailRoomId) ?? null;

  /**
   * Alles, was die Zeile nicht zeigt — warum priorisiert, der Hauptschritt, Pausieren/Fortsetzen, Zurückspulen,
   * Sperre/Mangel und der Verlauf (Notizen + Nachrichten) — für das gemeinsame RoomDetailModal.
   */
  const buildDetailActions = (room: Room): RoomDetailActions => {
    const action = actionFor(room);
    const canBlock = ["DIRTY", "IN_PROGRESS", "PICKUP"].includes(room.status);
    return {
      primary: action && action !== "DND" && action !== "RESUME" ? { label: t(ACTION_LABEL[action]), onClick: () => runAction(room, action) } : null,
      busy: busyRoomId === room.id,
      priority: priorities[room.id],
      extra: (
        <>
          {action === "DND" && <p className="rounded-xl border border-status-out-of-order/40 bg-status-out-of-order/10 px-3 py-3 text-center text-sm font-medium text-status-out-of-order">{t("attendant.guestDndActive")}</p>}
          <PauseControl targetType="ROOM" targetId={room.id} pause={room.pause} canPause={room.status === "IN_PROGRESS"} size="lg" showBadge={false}
            onChanged={(p) => { setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, pause: p } : r))); refreshRoomsSoon(); }} />
          {room.rewind && (
            <button type="button" onClick={() => rewind(room)} disabled={busyRoomId === room.id}
              className="min-h-11 w-full rounded-xl border border-charcoal/20 bg-white px-3 text-sm font-medium disabled:opacity-50">
              ↶ {t("work.rewind", { status: t(`status.${room.rewind.to}` as TKey) })}
              <span className="ms-1 text-xs font-normal text-graphite/60">· {t("work.rewindUntil", { time: time(room.rewind.until) })}</span>
            </button>
          )}
        </>
      ),
      onBlock: canBlock && !room.pause ? () => { setDetailRoomId(null); setModal({ kind: "block", room }); } : undefined,
      onReportDefect: () => { setDetailRoomId(null); setModal({ kind: "defect", room }); },
      onNoteAdded: (note: ThreadNote) =>
        setRooms((prev) =>
          prev.map((r) => (r.id === room.id ? { ...r, notes: [note, ...(r.notes ?? [])].slice(0, 3), openNotesCount: (r.openNotesCount ?? 0) + 1 } : r))
        ),
      onNoteUpdated: (note: ThreadNote) => {
        setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: (r.notes ?? []).map((n) => (n.id === note.id ? note : n)) } : r)));
        refreshRoomsSoon();
      },
    };
  };

  const row = (room: Room, prefix?: React.ReactNode) => {
    const action = actionFor(room);
    const busy = busyRoomId === room.id;
    return (
      <RoomRowView key={room.id} room={asListRoom(room)} highlight={flash.has(room.number)} prefix={prefix}
        onOpen={() => setDetailRoomId(room.id)}
        badges={<>
          {room.guestDndActive && <IconBellSlash className="h-4 w-4 shrink-0 text-status-out-of-order" aria-label="DND" />}
          {room.status === "INSPECTED" && <span title={t("status.INSPECTED")} aria-hidden>🔒</span>}
          <NoteCountBadge openCount={room.openNotesCount ?? 0} totalCount={(room.notes ?? []).length} />
        </>}
        action={action === "DND"
          ? <p className="rounded-xl border border-status-out-of-order/40 bg-status-out-of-order/10 px-3 py-2 text-center text-sm font-medium text-status-out-of-order">{t("attendant.guestDndActive")}</p>
          : action && (
            <button type="button" onClick={() => runAction(room, action)} disabled={busy}
              className={`h-14 w-full rounded-xl text-lg font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50 ${action === "FINISH" ? "bg-status-clean" : "bg-status-in-progress"}`}>
              {busy ? "…" : action === "RESUME" ? `▶ ${t("work.resume")}` : t(ACTION_LABEL[action])}
            </button>
          )}
      />
    );
  };

  const section = (g: HkGroup, body: React.ReactNode, count: number) => (
    <section key={g} aria-label={t(GROUP_TITLE[g])} className="mb-5">
      <h3 className="mb-2 flex items-baseline gap-2 font-serif text-2xl">{t(GROUP_TITLE[g])}<span className="font-sans text-xs text-graphite/60">· {count}</span></h3>
      {body}
    </section>
  );

  return (
    <div className="animate-rise">
      <div className="mb-4 flex flex-wrap gap-2"><HubMoreMenu /></div>
      <div className="mb-4">
        <h2 className="font-serif text-4xl leading-none">{t("attendant.myRooms")}</h2>
        <div className="rule-gold my-2 w-40" />
        <MyFloorsToday />
        <p className="text-sm font-medium" aria-live="polite">
          {t("hkHub.progressRooms", { done: progress.done, total: progress.total })}
          {progress.creditsTotal > 0 && <> · {t("lists.credits", { done: progress.creditsDone.toString().replace(".", ","), total: progress.creditsTotal.toString().replace(".", ",") })}</>}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-charcoal/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("hkHub.progressRooms", { done: progress.done, total: progress.total })}>
          <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        {perFloor.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("hkHub.perFloor")}>
            {perFloor.map((f) => (
              <li key={f.floor} className={`rounded-full border px-2.5 py-1 text-xs ${f.released === f.total ? "border-status-clean/40 bg-status-clean/10" : "border-charcoal/15 bg-white"}`}>
                <span className="font-semibold">{t("attendant.floor", { floor: f.floor })}</span> · {t("hkHub.floorReleased", { done: f.released, total: f.total })}
              </li>
            ))}
          </ul>
        )}
      </div>
      <HubMissingNotice hub={hub} planner={false} />

      <PriorityBanner
        items={[
          { count: urgent.length, label: t("priority.urgentRooms"), icon: "warning", tone: "urgent", onClick: () => jumpTo(urgent[0]) },
          { count: agingBlocked.length, label: t("priority.blockedNeedsRecheck"), icon: "ban", tone: "urgent", onClick: () => jumpTo(agingBlocked[0]) },
        ]}
      />
      {topOpen && score(topOpen.id) > 0 && (
        <button type="button" onClick={() => jumpTo(topOpen)} className="mb-4 min-h-11 rounded-full border border-gold-line bg-parchment px-4 text-sm font-medium">
          ⇢ {t("hkHub.jump", { n: topOpen.number })}
        </button>
      )}

      <NotificationsPanel targetRole="room_attendant" />
      <OfflineBar state={offline} />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 p-3 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      <ErrorBoundary>
        {rooms.length === 0 ? (
          <p className="rounded-2xl border border-charcoal/10 bg-linen p-8 text-center text-graphite/60 shadow-card">{t("attendant.noRoomsAssigned")}</p>
        ) : (
          <>
            {groups.NOW.length > 0 && section("NOW", <ol className="space-y-2">{groups.NOW.map((r) => row(r))}</ol>, groups.NOW.length)}

            {section("NEXT", (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider ${routeLoad === "heavy" ? "bg-gold/15 text-gold-soft" : routeLoad === "typical" ? "bg-status-clean/10 text-status-clean" : "bg-parchment text-graphite/70"}`}>
                    {routeLoad === "heavy"
                      ? t("attendant.aboveTypical", { low: TYPICAL_DAILY_ROOMS.low, high: TYPICAL_DAILY_ROOMS.high })
                      : t("attendant.typicalDay", { low: TYPICAL_DAILY_ROOMS.low, high: TYPICAL_DAILY_ROOMS.high })}
                  </span>
                  {groups.NEXT.length > 1 && (
                    <button type="button" aria-pressed={reordering} onClick={() => setReordering((v) => !v)}
                      className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${reordering ? "border-gold-line bg-parchment" : "border-charcoal/15 bg-white"}`}>
                      {reordering ? t("hkHub.reorderDone") : t("hkHub.reorder")}
                    </button>
                  )}
                </div>
                {groups.NEXT.length === 0 ? <p className="text-sm text-graphite/60">{t("hkHub.empty")}</p> : reordering ? (
                  <div className="space-y-2">
                    <p className="text-xs text-graphite/60">{t("attendant.routeExplain")}</p>
                    {routeChunks.map((chunk, chunkIdx) => {
                      const startIndex = routeChunks.slice(0, chunkIdx).reduce((n, c) => n + c.items.length, 0);
                      return (
                        <div key={`${chunk.floor}-${chunkIdx}`}>
                          <p className="mb-1 text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">
                            {t("attendant.floorStops", { floor: chunk.floor, from: startIndex + 1, to: startIndex + chunk.items.length })}
                          </p>
                          <DragReorderList items={chunk.items} getId={(r) => r.id} onReorder={(next) => reorderChunk(chunkIdx, next)} className="space-y-1.5"
                            renderItem={(room, i, handle) => (
                              <div className="flex items-center gap-2 rounded-lg border border-charcoal/10 bg-white px-2.5 py-2">
                                <button {...handle} type="button" onClick={(e) => e.stopPropagation()} aria-label={t("attendant.dragToReorder", { number: room.number })}
                                  className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-graphite/40 hover:bg-parchment active:cursor-grabbing">
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                                    <circle cx="4" cy="3" r="1.3" /><circle cx="10" cy="3" r="1.3" /><circle cx="4" cy="7" r="1.3" />
                                    <circle cx="10" cy="7" r="1.3" /><circle cx="4" cy="11" r="1.3" /><circle cx="10" cy="11" r="1.3" />
                                  </svg>
                                </button>
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-ivory tabular-nums">{startIndex + i + 1}</span>
                                <span className="font-serif text-lg">{room.number}</span>
                                <span className="text-xs text-graphite/60">{t(`status.${room.status}` as TKey)}</span>
                              </div>
                            )} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {groups.NEXT.map((r, i) => row(r, <span aria-label={t("hkHub.stop", { n: i + 1 })} className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-navy text-xs font-semibold text-ivory tabular-nums">{i + 1}</span>))}
                  </ol>
                )}
              </>
            ), groups.NEXT.length)}

            {groups.DONE.length > 0 && (
              <Collapsible defaultOpen={false} summary={<span className="font-serif text-2xl">{t("hkHub.groupDone")} <span className="font-sans text-xs text-graphite/60">· {groups.DONE.length}</span></span>}>
                <ol className="space-y-2">{groups.DONE.map((r) => row(r))}</ol>
              </Collapsible>
            )}
            {groups.OTHER.length > 0 && (
              <Collapsible defaultOpen={false} summary={<span className="font-serif text-2xl">{t("hkHub.groupOther")} <span className="font-sans text-xs text-graphite/60">· {groups.OTHER.length}</span></span>}>
                <ol className="space-y-2">{groups.OTHER.map((r) => row(r))}</ol>
              </Collapsible>
            )}
          </>
        )}
      </ErrorBoundary>
      <MyWorkData />

      {/* Modal rendert selbst per Portal in <body> (die Seite liegt in einem animierten Container) — gilt auch für Sperre/Mangel unten. */}
      {detailRoom && (
        <ErrorBoundary>
          <RoomDetailModal
            room={detailRoom}
            onClose={() => setDetailRoomId(null)}
            actions={buildDetailActions(detailRoom)}
            summary={<RoomDayInfo day={dayById.get(detailRoom.id) ? { ...asListRoom(detailRoom) } : null} traces={dayById.get(detailRoom.id)?.traces} />}
            task={{ type: "ROOM", id: detailRoom.id }}
          />
        </ErrorBoundary>
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
            void loadRooms();
          }}
        />
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
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("attendant.defectModalTitle", { number: room.number })} subtitle={t("attendant.defectModalSubtitle")} onClose={onClose} dirty={!!note.trim() || !!photo}>
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

