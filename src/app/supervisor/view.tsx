"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import Modal from "@/components/Modal";
import { STATUS_STYLES } from "@/components/status";
import { BLOCK_REASON_SHORT, STATUS_LABELS, type BlockReason, type RoomStatus } from "@/lib/domain";

interface Note {
  id: string;
  body: string;
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
  isCheckoutToday: boolean;
  assignedTo?: { id: string; name: string } | null;
  arrivals: { guestName: string; eta?: string | null; vip: boolean; neededNow: boolean }[];
  notes: Note[];
  defects: { id: string; category: string; note: string; workOrder?: { status: string } | null }[];
}

interface Attendant {
  id: string;
  name: string;
  section?: string | null;
  currentRoomId?: string | null;
  lastSeenAt?: string | null;
}

const LEGEND: RoomStatus[] = [
  "DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "PICKUP", "BLOCKED",
  "DEFECT_REPORTED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT",
];

export default function SupervisorView({ isDutyManager }: { isDutyManager: boolean }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "rework" | "ooo"; room: Room } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "ALL">("ALL");
  const [floorFilter, setFloorFilter] = useState<number | "ALL">("ALL");
  const [attendantFilter, setAttendantFilter] = useState<string>("ALL");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ rooms: Room[]; attendants: Attendant[] }>("/api/rooms");
    setRooms(data.rooms);
    setAttendants(data.attendants);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Arrivals are nested inside the room payload and cannot be patched from an
  // arrival event alone, so those fall back to a coalesced refetch.
  const refetchSoon = useCoalescedRefetch(load, 2000);

  useSocket({
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
      setTicker(`Room ${p.number}: ${p.from} → ${p.to} (${p.by})`);
      setTimeout(() => setTicker(null), 6000);
    },
    "attendant:location": (p: { userId: string; roomId: string }) => {
      setAttendants((prev) =>
        prev.map((a) => (a.id === p.userId ? { ...a, currentRoomId: p.roomId, lastSeenAt: new Date().toISOString() } : a))
      );
    },
    "note:new": (p: { note: Note }) => {
      setRooms((prev) =>
        prev.map((r) => (r.id === p.note.roomId ? { ...r, notes: [p.note, ...r.notes].slice(0, 3) } : r))
      );
    },
    "arrival:update": () => refetchSoon(),
    // A whole plan changed at once — one refetch instead of 145 patches.
    "assignments:applied": () => refetchSoon(),
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
      if (!q) return true;
      return (
        room.number.toLowerCase().includes(q) ||
        room.section.toLowerCase().includes(q) ||
        room.assignedTo?.name.toLowerCase().includes(q) ||
        room.arrivals.some((a) => a.guestName.toLowerCase().includes(q))
      );
    });
  }, [rooms, search, statusFilter, floorFilter, attendantFilter]);

  const filtersActive =
    search.trim() !== "" || statusFilter !== "ALL" || floorFilter !== "ALL" || attendantFilter !== "ALL";

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
  const inspected = rooms.filter((r) => r.status === "INSPECTED").length;
  const sellable = rooms.filter((r) => !["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status)).length;
  const progress = sellable ? Math.round((inspected / sellable) * 100) : 0;

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
      setError(`Room ${room.number}: ${(e as Error).message}`);
    } finally {
      setBusyRoomId(null);
    }
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
          ? `${res.changed} rooms released and pushed to the PMS.`
          : `${res.changed} released, ${res.rejected} could not be: ${res.failed[0]?.error ?? ""}`
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="animate-rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">Live Board</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">Five floors · {rooms.length} keys</p>
        </div>
        <div className="flex gap-2">
          {isDutyManager && (
            <Link
              href="/settings"
              className="flex h-14 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
            >
              Settings
            </Link>
          )}
          <Link
            href="/supervisor/planning"
            className="flex h-14 items-center rounded-xl bg-charcoal px-6 text-sm font-semibold tracking-wide text-ivory transition hover:bg-espresso"
          >
            Morning planning →
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Released / sellable" value={`${inspected}/${sellable}`} />
        <Kpi label="Daily progress" value={`${progress}%`} bar={progress} />
        <Kpi label="Release queue" value={String(releaseQueue.length)} accent={releaseQueue.length >= 5} />
        <Kpi label="Blocked" value={String(rooms.filter((r) => r.status === "BLOCKED").length)} />
      </div>

      {ticker && <div className="mb-3 rounded-lg border border-gold/40 bg-parchment px-4 py-2 text-sm">⚡ {ticker}</div>}
      {error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      {bulkResult && (
        <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {bulkResult}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div>
          {/* Finding one room among 145 tiles should not mean scrolling. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-charcoal/10 bg-linen p-3 shadow-card">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search room, section, guest or attendant…"
              className="h-12 min-w-[14rem] flex-1 rounded-xl border border-charcoal/15 bg-white px-4 outline-none focus:border-gold"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RoomStatus | "ALL")}
              aria-label="Filter by status"
              className="h-12 rounded-xl border border-charcoal/15 bg-white px-3"
            >
              <option value="ALL">All statuses</option>
              {LEGEND.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={String(floorFilter)}
              onChange={(e) => setFloorFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
              aria-label="Filter by floor"
              className="h-12 rounded-xl border border-charcoal/15 bg-white px-3"
            >
              <option value="ALL">All floors</option>
              {[...new Set(rooms.map((r) => r.floor))]
                .sort((a, b) => a - b)
                .map((f) => (
                  <option key={f} value={f}>
                    Floor {f}
                  </option>
                ))}
            </select>
            <select
              value={attendantFilter}
              onChange={(e) => setAttendantFilter(e.target.value)}
              aria-label="Filter by attendant"
              className="h-12 rounded-xl border border-charcoal/15 bg-white px-3"
            >
              <option value="ALL">Anyone</option>
              <option value="NONE">Unassigned</option>
              {attendants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {filtersActive && (
              <>
                <span className="text-sm text-graphite/60">
                  {visible.length} of {rooms.length}
                </span>
                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                    setFloorFilter("ALL");
                    setAttendantFilter("ALL");
                  }}
                  className="h-12 rounded-xl border border-charcoal/15 px-4 text-sm"
                >
                  Clear
                </button>
              </>
            )}
          </div>

          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {LEGEND.map((s) => (
              <span key={s} className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                {STATUS_LABELS[s]}
              </span>
            ))}
          </div>

          {byFloor.map(([floor, floorRooms]) => (
            <div key={floor} className="mb-4">
              <h3 className="mb-2 font-serif text-xl">
                Floor {floor}
                <span className="ml-2 text-xs uppercase tracking-wider text-graphite/50">
                  {floorRooms.filter((r) => r.status === "INSPECTED").length}/{floorRooms.length} released
                </span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.6rem,1fr))] gap-1.5">
                {floorRooms.map((room) => {
                  const attHere = attendants.find((a) => a.currentRoomId === room.id);
                  return (
                    <button
                      key={room.id}
                      onClick={() => setSelectedId(room.id)}
                      className={`relative flex h-16 flex-col items-center justify-center rounded-lg border-b-4 text-sm font-semibold shadow-sm transition active:scale-95 ${STATUS_STYLES[room.status].tile} ${
                        busyRoomId === room.id ? "animate-pulse" : ""
                      }`}
                      title={`${room.number} — ${STATUS_LABELS[room.status]}`}
                    >
                      {room.number}
                      <span className="max-w-full truncate px-1 text-[9px] font-normal opacity-80">
                        {room.status === "BLOCKED" && room.blockReason
                          ? BLOCK_REASON_SHORT[room.blockReason as BlockReason] ?? room.blockReason
                          : room.section}
                      </span>
                      {room.arrivals.some((a) => a.vip) && <span className="absolute left-1 top-0.5 text-[10px]">★</span>}
                      {attHere && (
                        <span className="absolute right-0.5 top-0.5 rounded bg-black/40 px-1 text-[9px]" title={attHere.name}>
                          👤
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-serif text-xl">Release queue</h3>
            {releaseQueue.length === 0 && <p className="text-sm text-graphite/60">Nothing waiting for inspection.</p>}

            {releaseQueue.length > 1 && (
              <button
                onClick={() => releaseAll()}
                disabled={bulkBusy}
                className="mb-3 h-14 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {bulkBusy ? "Releasing…" : `✓ Release all ${releaseQueue.length}`}
              </button>
            )}
            <div className="space-y-2">
              {releaseQueue.map((room) => {
                const busy = busyRoomId === room.id;
                return (
                  <div key={room.id} className="rounded-xl border border-yellow-300 bg-yellow-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xl">{room.number}</span>
                      <span className="text-xs text-graphite/60">
                        waiting {Math.round((Date.now() - new Date(room.statusSince).getTime()) / 60000)} min
                      </span>
                    </div>
                    {room.arrivals[0] && (
                      <p className="mt-1 text-xs text-graphite/70">
                        {room.arrivals[0].vip && "★ VIP · "}
                        {room.arrivals[0].guestName}
                        {room.arrivals[0].eta &&
                          ` · ETA ${new Date(room.arrivals[0].eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => act(room, "INSPECTED")}
                        disabled={busy}
                        className="h-12 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy ? "…" : "✓ Inspect & release"}
                      </button>
                      <button
                        onClick={() => setDialog({ kind: "rework", room })}
                        disabled={busy}
                        className="h-12 rounded-lg border-2 border-orange-500 text-sm font-semibold text-orange-700 transition active:scale-[0.98] disabled:opacity-50"
                      >
                        ↩ Rework
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-serif text-xl">Attendants</h3>
            <div className="space-y-2">
              {attendants.map((a) => {
                const loc = a.currentRoomId ? roomById.get(a.currentRoomId) : null;
                return (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-ivory px-3 py-2 text-sm">
                    <span>{a.name}</span>
                    <span className="text-graphite/60">
                      {loc ? `in ${loc.number}` : a.section ? `section ${a.section}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <RoomDrawer
          room={selected}
          attendants={attendants}
          isDutyManager={isDutyManager}
          busy={busyRoomId === selected.id}
          onClose={() => setSelectedId(null)}
          onAct={act}
          onOpenDialog={(kind) => setDialog({ kind, room: selected })}
          onNoteAdded={(note) =>
            setRooms((prev) =>
              prev.map((r) => (r.id === note.roomId ? { ...r, notes: [note, ...r.notes].slice(0, 3) } : r))
            )
          }
          onAssigned={(room) => setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, ...room } : r)))}
        />
      )}

      {dialog?.kind === "rework" && (
        <ReworkModal
          room={dialog.room}
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            setDialog(null);
            await act(dialog.room, "PICKUP", { note });
          }}
        />
      )}
      {dialog?.kind === "ooo" && (
        <OooModal
          room={dialog.room}
          onClose={() => setDialog(null)}
          onSubmit={async (until) => {
            setDialog(null);
            await act(dialog.room, "OUT_OF_ORDER", { oooUntil: until.toISOString() });
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, bar, accent }: { label: string; value: string; bar?: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-amber-400 bg-amber-50" : "border-charcoal/10 bg-white"}`}>
      <div className="text-xs uppercase tracking-wider text-graphite/60">{label}</div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-parchment">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

/** Rework reasons a supervisor reaches for most often — one tap instead of typing. */
const REWORK_PRESETS = [
  "Bathroom not spotless",
  "Minibar not restocked",
  "Linen / turndown",
  "Dust on surfaces",
  "Amenities missing",
  "Room needs airing",
];

function ReworkModal({
  room,
  onClose,
  onSubmit,
}: {
  room: Room;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const add = (preset: string) => setNote((n) => (n ? `${n}, ${preset.toLowerCase()}` : preset));

  return (
    <Modal
      title={`Send room ${room.number} back`}
      subtitle="The attendant sees this note on their device."
      onClose={onClose}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {REWORK_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => add(p)}
            className="h-11 rounded-full border border-charcoal/20 px-3 text-sm hover:border-gold hover:bg-parchment"
          >
            + {p}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        autoFocus
        placeholder="What needs to be redone?"
        className="mb-4 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className="h-14 rounded-xl border border-charcoal/20 text-base">
          Cancel
        </button>
        <button
          onClick={() => onSubmit(note.trim())}
          disabled={!note.trim()}
          className="h-14 rounded-xl bg-orange-600 text-base font-semibold text-white disabled:opacity-40"
        >
          ↩ Send back
        </button>
      </div>
    </Modal>
  );
}

const OOO_PRESETS: { label: string; hours: number }[] = [
  { label: "4 hours", hours: 4 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

function OooModal({ room, onClose, onSubmit }: { room: Room; onClose: () => void; onSubmit: (until: Date) => void }) {
  const [hours, setHours] = useState<number>(48);
  const until = new Date(Date.now() + hours * 3600_000);

  return (
    <Modal
      title={`Out of order · ${room.number}`}
      subtitle="The room leaves sellable inventory until this time."
      onClose={onClose}
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {OOO_PRESETS.map((p) => (
          <button
            key={p.hours}
            onClick={() => setHours(p.hours)}
            className={`h-14 rounded-xl border text-sm font-medium ${
              hours === p.hours ? "border-gold bg-parchment font-semibold" : "border-charcoal/20"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium">Custom (hours)</label>
      <input
        type="number"
        min={1}
        value={hours}
        onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
        className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 px-3 text-base outline-none focus:border-gold"
      />
      <p className="mb-4 rounded-lg bg-ivory p-3 text-sm text-graphite/70">
        Back in inventory on <strong>{until.toLocaleString()}</strong>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className="h-14 rounded-xl border border-charcoal/20 text-base">
          Cancel
        </button>
        <button onClick={() => onSubmit(until)} className="h-14 rounded-xl bg-gray-600 text-base font-semibold text-white">
          Set out of order
        </button>
      </div>
    </Modal>
  );
}

function RoomDrawer({
  room,
  attendants,
  isDutyManager,
  busy,
  onClose,
  onAct,
  onOpenDialog,
  onNoteAdded,
  onAssigned,
}: {
  room: Room;
  attendants: Attendant[];
  isDutyManager: boolean;
  busy: boolean;
  onClose: () => void;
  onAct: (room: Room, status: RoomStatus, extra?: Record<string, unknown>) => Promise<void>;
  onOpenDialog: (kind: "rework" | "ooo") => void;
  onNoteAdded: (note: Note) => void;
  onAssigned: (room: Room) => void;
}) {
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const style = STATUS_STYLES[room.status];

  const addNote = async () => {
    if (!noteBody.trim() || savingNote) return;
    setSavingNote(true);
    try {
      const res = await api<{ note: Note }>(`/api/rooms/${room.id}/notes`, { body: { body: noteBody } });
      onNoteAdded({ ...res.note, roomId: room.id });
      setNoteBody("");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-4xl">{room.number}</h3>
            <p className="text-xs uppercase tracking-wider text-graphite/50">
              Floor {room.floor} · {room.section} · {room.type.replace(/_/g, " ")}
            </p>
          </div>
          <button onClick={onClose} className="h-12 w-12 rounded-lg hover:bg-parchment">✕</button>
        </div>

        <span className={`inline-block rounded-full border px-3 py-1.5 text-sm font-medium ${style.chip}`}>
          {STATUS_LABELS[room.status]}
          {room.blockReason && ` · ${room.blockReason}`}
        </span>
        {room.oooUntil && (
          <p className="mt-1 text-xs text-graphite/60">OOO until {new Date(room.oooUntil).toLocaleString()}</p>
        )}
        {room.reworkNote && room.status === "PICKUP" && (
          <p className="mt-2 rounded-lg bg-orange-50 p-2 text-sm text-orange-900">Rework: {room.reworkNote}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {room.status === "CLEAN" && (
            <>
              <button
                onClick={() => onAct(room, "INSPECTED")}
                disabled={busy}
                className="col-span-2 h-14 rounded-xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Releasing…" : "✓ Inspect & release"}
              </button>
              <button
                onClick={() => onOpenDialog("rework")}
                disabled={busy}
                className="col-span-2 h-12 rounded-xl border-2 border-orange-500 font-medium text-orange-700 disabled:opacity-50"
              >
                ↩ Send back (rework)
              </button>
            </>
          )}
          {room.status === "INSPECTED" && (
            <button
              onClick={() => onAct(room, "DIRTY")}
              disabled={busy}
              className="col-span-2 h-12 rounded-xl border-2 border-red-400 font-medium text-red-700 disabled:opacity-50"
            >
              Set DIRTY (new checkout)
            </button>
          )}
          {["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(room.status) ? (
            <button
              onClick={() => onAct(room, "DIRTY")}
              disabled={busy}
              className="col-span-2 h-12 rounded-xl border-2 border-charcoal/30 font-medium disabled:opacity-50"
            >
              Return to inventory (DIRTY)
            </button>
          ) : (
            <>
              <button
                onClick={() => onOpenDialog("ooo")}
                disabled={busy}
                className="h-12 rounded-xl border-2 border-gray-400 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                Set OOO…
              </button>
              <button
                onClick={() => onAct(room, "OUT_OF_SERVICE")}
                disabled={busy}
                className="h-12 rounded-xl border-2 border-gray-300 text-sm font-medium text-gray-600 disabled:opacity-50"
              >
                Set OOS
              </button>
            </>
          )}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Assigned attendant</label>
          <select
            value={room.assignedTo?.id ?? ""}
            onChange={async (e) => {
              const res = await api<{ room: Room }>(`/api/rooms/${room.id}/assign`, {
                body: { attendantId: e.target.value || null },
              });
              onAssigned(res.room);
            }}
            className="h-12 w-full rounded-lg border border-charcoal/20 bg-white px-3"
          >
            <option value="">— unassigned —</option>
            {attendants.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {room.arrivals.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">Expected arrivals</h4>
            {room.arrivals.map((a, i) => (
              <p key={i} className="text-sm">
                {a.vip && "★ "}{a.guestName}
                {a.eta && ` · ETA ${new Date(a.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                {a.neededNow && " · NEEDED NOW"}
              </p>
            ))}
          </div>
        )}

        {room.defects.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">Defects</h4>
            {room.defects.map((d) => (
              <p key={d.id} className="text-sm">
                🔧 {d.category}: {d.note}
                {d.workOrder && <span className="ml-1 text-xs text-graphite/60">[{d.workOrder.status}]</span>}
              </p>
            ))}
          </div>
        )}

        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">Notes</h4>
          {room.notes.map((n) => (
            <div key={n.id} className="mb-1 rounded-lg bg-ivory p-2 text-sm">
              <span className="text-xs text-graphite/60">
                {n.author.name} ({n.author.role.replace(/_/g, " ")}) ·{" "}
                {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <p>{n.body}</p>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <input
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Add a note…"
              className="h-12 flex-1 rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold"
            />
            <button
              onClick={addNote}
              disabled={savingNote || !noteBody.trim()}
              className="h-12 rounded-lg bg-charcoal px-4 text-ivory disabled:opacity-40"
            >
              {savingNote ? "…" : "Add"}
            </button>
          </div>
        </div>

        {isDutyManager && (
          <p className="mt-6 text-center text-xs text-graphite/50">
            Duty manager: full audit trail via GET /api/audit
          </p>
        )}
      </div>
    </div>
  );
}
