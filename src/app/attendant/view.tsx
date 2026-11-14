"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NetworkError, api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import DragReorderList from "@/components/DragReorderList";
import ErrorBoundary from "@/components/ErrorBoundary";
import { type ThreadNote } from "@/components/NoteThread";
import { type PauseInfo, reasonKey } from "@/components/PauseControl";
import { type ListRoom } from "@/components/lists/RoomRowView";
import { useMyFloors } from "@/components/lists/MyFloorsToday";
import { type HubState } from "@/components/HubMissingNotice";
import { DetailContainer } from "@/components/shell/DetailContainer";
import { useBreakpoint } from "@/components/shell/useBreakpoint";
import { Banner, Button } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { HkHub, type HkListItem } from "@/components/hk/HkHub";
import { HkRoomDetail, TextAction, type HkDetailData } from "@/components/hk/HkRoomDetail";
import { HkBlockDialog, HkDefectDialog, HkMyWorkData, HkNoteThread, HkNotifications, HkOfflineBar, HkPauseControl } from "@/components/hk/HkParts";
import { type NoteStatus, type RoomStatus } from "@/lib/domain";
import { chunkByFloor, routeLoadLabel, TYPICAL_DAILY_ROOMS } from "@/lib/assignment/routeOrder";
import { ACTION_TARGET, floorProgress, hkGroupOf, orderRoute, primaryActionFor, type HkAction, type HkGroup } from "@/lib/rooms/hkGroups";
import { hkKpis, withoutLeadingSymbol as plain, type HkRoomView } from "@/lib/ui/hkHub";
import type { IconName } from "@/lib/ui/icons";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";
import { listTier } from "@/lib/planung/listOrder";
import { berlinHHMM } from "@/lib/dayplan/time";

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
const ACTION_ICON: Record<Exclude<HkAction, null | "DND">, IconName> = { START: "play", FINISH: "check", UNBLOCK: "play", RESUME: "play" };
const time = (iso: string) => hhmm(iso);

/**
 * Housekeeper-Hub (D2, Design „Glas & Premium“): Kennzahlen, Zimmerliste nach Gruppen (Jetzt dran / Als Nächstes mit
 * empfohlener Route und Ziehen zum Sortieren / Erledigt / heute keine Reinigung), Detail per `DetailContainer`
 * (Panel ≥ 1280, Einschub 640–1279, Sheet < 640) mit Hauptknopf, Pausieren, Zurückspulen, Mangel/„Nicht möglich“ und Verlauf.
 * Daten: /api/rooms?mine=1 + /api/lists/housekeeper + /api/priority, live per Socket.IO (Schlüssel = Zimmer-Id).
 * Aktionen und Endpunkte wie vor D2 — nur die Darstellung ist neu. Unvollständige Antworten crashen nicht.
 */
export default function AttendantView() {
  const { t, intl } = useLocale();
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
    "app:resync": () => refreshAll(), // Meldungs-Zentrum: App wieder offen/online → alles nachladen
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

  const score = useCallback((id: string) => priorities[id]?.score ?? 0, [priorities]);
  const reasonsOf = useCallback((id: string) => priorities[id]?.reasons ?? [], [priorities]);

  /** Anzeige-Daten eines Zimmers: Status/Pause/DND live aus dem Board, Art/Gast/Zeit aus der Tagesliste, Dringlichkeit aus der Priorität. */
  const viewOf = useCallback((r: Room): HkRoomView => {
    const d = dayById.get(r.id);
    const reasons = reasonsOf(r.id);
    return {
      id: r.id, number: r.number, status: r.status, kind: d?.kind ?? null,
      vip: !!d?.vip || (r.arrivals ?? []).some((a) => a.vip),
      laundry: !!d?.laundry,
      dnd: !!d?.dnd || !!r.guestDndActive,
      paused: !!r.pause,
      defects: (r.defects ?? []).filter((x) => x.workOrder?.status !== "RESOLVED").length,
      eta: d?.eta ?? (r.arrivals ?? []).find((a) => a.eta)?.eta ?? null,
      early: (r.arrivals ?? []).some((a) => a.neededNow) || reasons.some((x) => x.signal === "needed_now" || x.signal === "early_check_in"),
      urgent: reasons.some((x) => x.signal === "needed_now" || x.signal === "vip") || !!d?.rush || !!d?.serviceNow,
      cleanAfter: d?.cleanAfter ?? null,
    };
  }, [dayById, reasonsOf]);

  // Planung L1 (Regel 7): Stufe aus der Tagesliste (Rush, Service Now, Turn ausgecheckt, Bleiber, …) vor der Route
  const tierOf = useCallback((r: Room) => {
    const d = dayById.get(r.id);
    return listTier({
      kind: d?.kind ?? null, rush: !!d?.rush || (r.arrivals ?? []).some((a) => a.neededNow), serviceNow: !!d?.serviceNow,
      cleanAfter: d?.cleanAfter ?? null, checkedOut: !!d?.checkedOut,
    }, berlinHHMM(new Date()));
  }, [dayById]);

  const groups = useMemo(() => {
    const by: Record<HkGroup, Room[]> = { NOW: [], NEXT: [], DONE: [], OTHER: [] };
    for (const r of rooms) by[hkGroupOf(r.status)].push(r);
    return { NOW: orderRoute(by.NOW, score, tierOf), NEXT: orderRoute(by.NEXT, score, tierOf), DONE: by.DONE, OTHER: by.OTHER };
  }, [rooms, score, tierOf]);
  const routeChunks = useMemo(() => chunkByFloor(groups.NEXT), [groups.NEXT]);
  const routeLoad = routeLoadLabel(groups.NOW.length + groups.NEXT.length + groups.DONE.length);

  // Fortschritt wie in „Meine Liste“ (Zimmer + Credits aus der Tagesliste); ohne Liste aus den Zimmern selbst.
  const progress = list?.progress ?? { done: groups.DONE.length, total: rooms.length - groups.OTHER.length, creditsDone: 0, creditsTotal: 0 };
  const perFloor = useMemo(() => floorProgress(rooms), [rooms]);
  const kpis = hkKpis(rooms.map((r) => r.status), list?.progress);
  const floors = useMyFloors();

  /** Reihenfolge: Jetzt dran, Als Nächstes (Route), Erledigt, heute keine Reinigung — Schlüssel = Zimmer-Id (kein Springen bei Live-Updates). */
  const items: HkListItem[] = useMemo(
    () =>
      (["NOW", "NEXT", "DONE", "OTHER"] as HkGroup[]).flatMap((g) =>
        groups[g].map((r) => {
          const d = dayById.get(r.id);
          return { view: viewOf(r), group: g, guest: d?.guest ?? null, lang: d?.lang ?? null, pax: d?.pax ?? null, flash: flash.has(r.number) };
        }),
      ),
    [groups, dayById, viewOf, flash],
  );

  const agingBlocked = useMemo(
    () => rooms.filter((r) => r.status === "BLOCKED" && priorities[r.id]?.reasons?.some((rs) => rs.signal === "blocked_age")),
    [rooms, priorities]
  );

  // Ab 1280 px steht das Detail neben der Liste: beim ersten Laden das oberste offene Zimmer zeigen (wie im Entwurf).
  const bp = useBreakpoint();
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || bp !== "wide" || detailRoomId) return;
    const first = groups.NOW[0] ?? groups.NEXT[0];
    if (first) { autoSelected.current = true; setDetailRoomId(first.id); }
  }, [bp, groups, detailRoomId]);
  const select = (id: string) => { autoSelected.current = true; setDetailRoomId(id); };

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

  const detailData = (room: Room): HkDetailData => {
    const d = dayById.get(room.id);
    const p = priorities[room.id];
    return {
      view: viewOf(room),
      statusKey: `status.${room.status}` as TKey,
      blockReasonKey: room.blockReason ? (`blockReason.${room.blockReason}` as TKey) : null,
      guest: d?.guest ?? null,
      lang: d?.lang ?? null,
      pax: d?.pax ?? null,
      credits: d?.credits,
      traces: Array.isArray(d?.traces) ? d!.traces : [],
      hints: Array.isArray(d?.hints) ? d!.hints : [],
      reworkNote: room.status === "PICKUP" ? room.reworkNote ?? null : null,
      defects: (room.defects ?? []).map((x) => ({
        id: x.id,
        label: `${t(`defectCategory.${x.category}` as TKey)}: ${x.note}${x.workOrder ? ` · ${t(`workOrderStatus.${x.workOrder.status}` as TKey)}` : ""}`,
      })),
      guestRequests: (room.guestRequests ?? []).map((g) => ({ id: g.id, label: `${t(`guestRequestKind.${g.kind}` as TKey)} · ${t(`guestRequestStatus.${g.status}` as TKey)} · ${hhmm(g.createdAt)}` })),
      priority: p ?? null,
      pauseText: room.pause
        ? [room.pause.reason ? t(reasonKey(room.pause.reason)) : null, t("work.pausedSince", { time: time(room.pause.since) }), room.pause.byName ? t("work.pausedBy", { name: room.pause.byName }) : null].filter(Boolean).join(" · ")
        : null,
    };
  };

  const detail = (() => {
    const room = detailRoom;
    const action = room ? actionFor(room) : null;
    const busy = !!room && busyRoomId === room.id;
    const canBlock = !!room && ["DIRTY", "IN_PROGRESS", "PICKUP"].includes(room.status) && !room.pause;
    const label = action && action !== "DND" ? plain(t(ACTION_LABEL[action])) : null;
    return (
      <DetailContainer
        // Ab 1280: Panel so hoch, dass der Hauptknopf ohne Scrollen sichtbar ist (Inhalt scrollt im Panel)
        className="xl:max-h-[calc(100dvh-17rem)]"
        open={!!room}
        onClose={() => { autoSelected.current = true; setDetailRoomId(null); }}
        title={room ? t("hkHub.roomTitle", { n: room.number }) : ""}
        footer={room && label && action ? (
          <Button icon={ACTION_ICON[action as Exclude<HkAction, null | "DND">]} block disabled={busy} onClick={() => runAction(room, action)}>
            {busy ? "…" : label}
          </Button>
        ) : undefined}
      >
        {room && (
          <ErrorBoundary>
            <HkRoomDetail
              data={detailData(room)}
              pause={
                <HkPauseControl
                  key={room.id}
                  targetType="ROOM"
                  targetId={room.id}
                  canPause={room.status === "IN_PROGRESS" && !room.pause}
                  onChanged={(p: PauseInfo | null) => { setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, pause: p } : r))); refreshRoomsSoon(); }}
                />
              }
              actions={
                <>
                  {canBlock && <TextAction icon="moon" onClick={() => { setDetailRoomId(null); setModal({ kind: "block", room }); }}>{plain(t("attendant.blockedAction"))}</TextAction>}
                  <TextAction icon="wrench" onClick={() => { setDetailRoomId(null); setModal({ kind: "defect", room }); }}>{plain(t("attendant.defectAction"))}</TextAction>
                  {room.rewind && (
                    <TextAction icon="refresh" disabled={busy} onClick={() => rewind(room)}>
                      {t("work.rewind", { status: t(`status.${room.rewind.to}` as TKey) })} · {t("work.rewindUntil", { time: time(room.rewind.until) })}
                    </TextAction>
                  )}
                </>
              }
              thread={
                <HkNoteThread
                  key={`${room.id}:${(room.notes ?? []).map((n) => `${n.id}${n.status}`).join()}`}
                  roomId={room.id}
                  initialNotes={room.notes ?? []}
                  task={{ type: "ROOM", id: room.id }}
                  onNoteAdded={(note: ThreadNote) =>
                    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: [note, ...(r.notes ?? [])].slice(0, 3), openNotesCount: (r.openNotesCount ?? 0) + 1 } : r)))
                  }
                  onNoteUpdated={(note: ThreadNote) => {
                    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: (r.notes ?? []).map((n) => (n.id === note.id ? note : n)) } : r)));
                    refreshRoomsSoon();
                  }}
                />
              }
            />
          </ErrorBoundary>
        )}
      </DetailContainer>
    );
  })();

  const notices = (
    <>
      <HkOfflineBar state={offline} />
      {hub && !hub.ready && (
        <Banner
          tone="info"
          icon="calendar-days"
          title={t("hubDay.missingTitle", { date: new Date(`${hub.date}T12:00:00Z`).toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) })}
          detail={t("hubDay.missingAttendant")}
        />
      )}
      {error && (
        <div role="alert">
          <Banner tone="warning" icon="triangle-alert" title={error} />
        </div>
      )}
      {agingBlocked.length > 0 && (
        <button type="button" onClick={() => select(agingBlocked[0].id)} className={cx("press rounded-(--glass-radius-md) text-start", FOCUS_RING)}>
          <Banner tone="warning" icon="moon" title={t("hkHub.withCount", { label: t("priority.blockedNeedsRecheck"), n: agingBlocked.length })} detail={agingBlocked.map((r) => r.number).join(", ")} />
        </button>
      )}
    </>
  );

  const reorderToggle = groups.NEXT.length > 1 ? (
    <button
      type="button"
      aria-pressed={reordering}
      onClick={() => setReordering((v) => !v)}
      className={cx("text-label min-h-(--size-touch-min) rounded-pill px-4 text-accent-text underline underline-offset-4", FOCUS_RING)}
    >
      {reordering ? t("hkHub.reorderDone") : t("hkHub.reorder")}
    </button>
  ) : undefined;

  const reorderContent = reordering ? (
    <div className="flex flex-col gap-3">
      <p className="text-label text-text-muted">{t("attendant.routeExplain")}</p>
      {routeChunks.map((chunk, chunkIdx) => {
        const startIndex = routeChunks.slice(0, chunkIdx).reduce((n, c) => n + c.items.length, 0);
        return (
          <div key={`${chunk.floor}-${chunkIdx}`} className="flex flex-col gap-2">
            <p className="text-section text-text-muted">
              {t("attendant.floorStops", { floor: chunk.floor, from: startIndex + 1, to: startIndex + chunk.items.length })}
            </p>
            <DragReorderList items={chunk.items} getId={(r) => r.id} onReorder={(next) => reorderChunk(chunkIdx, next)} className="flex flex-col gap-2"
              renderItem={(room, i, handle) => (
                <div className="flex min-h-(--size-touch-min) items-center gap-3 rounded-(--glass-radius-sm) bg-surface-card-raised px-2 py-2">
                  <button {...handle} type="button" onClick={(e) => e.stopPropagation()} aria-label={t("attendant.dragToReorder", { number: room.number })}
                    className={cx("flex size-12 shrink-0 cursor-grab touch-none items-center justify-center rounded-(--glass-radius-sm) text-text-secondary active:cursor-grabbing", FOCUS_RING)}>
                    <span aria-hidden="true" className="text-title-22 leading-none">⋮⋮</span>
                  </button>
                  <span className="glass-disc text-label flex size-8 shrink-0 items-center justify-center text-text-primary">{startIndex + i + 1}</span>
                  <span className="text-title-22 text-text-primary">{room.number}</span>
                  <span className="text-label text-text-secondary">{t(`status.${room.status}` as TKey)}</span>
                </div>
              )} />
          </div>
        );
      })}
    </div>
  ) : undefined;

  return (
    <>
      <HkHub
        items={items}
        kpis={kpis}
        progress={progress}
        floors={floors}
        perFloor={perFloor}
        routeLoadText={routeLoad === "heavy"
          ? t("attendant.aboveTypical", { low: TYPICAL_DAILY_ROOMS.low, high: TYPICAL_DAILY_ROOMS.high })
          : t("attendant.typicalDay", { low: TYPICAL_DAILY_ROOMS.low, high: TYPICAL_DAILY_ROOMS.high })}
        selectedId={detailRoomId}
        onSelect={select}
        detail={detail}
        detailOpen={!!detailRoom}
        notices={notices}
        hubMissing={!!hub && !hub.ready}
        reorderToggle={reorderToggle}
        reorderContent={reorderContent}
        below={
          <>
            <HkNotifications compact={bp === "phone"} />
            <HkMyWorkData />
          </>
        }
      />

      {modal?.kind === "block" && (
        <HkBlockDialog
          room={modal.room.number}
          onClose={() => setModal(null)}
          onSubmit={(reason) => {
            const room = modal.room;
            setModal(null);
            void setStatus(room, "BLOCKED", { blockReason: reason });
          }}
        />
      )}
      {modal?.kind === "defect" && (
        <HkDefectDialog
          room={modal.room.number}
          onClose={() => setModal(null)}
          onSubmit={async (fd) => {
            await api(`/api/rooms/${modal.room.id}/defects`, { formData: fd });
            setModal(null);
            void loadRooms();
          }}
        />
      )}
    </>
  );
}
