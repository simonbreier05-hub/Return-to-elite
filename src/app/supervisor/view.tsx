"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { STATUS_STYLES } from "@/components/status";
import { STATUS_LABELS, type RoomStatus } from "@/lib/domain";

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
  notes: { id: string; body: string; author: { name: string; role: string }; createdAt: string }[];
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
  const [selected, setSelected] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ rooms: Room[]; attendants: Attendant[] }>("/api/rooms");
    setRooms(data.rooms);
    setAttendants(data.attendants);
    setSelected((sel) => (sel ? data.rooms.find((r) => r.id === sel.id) ?? null : null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({
    "room:update": () => load(),
    "room:status": (p: { number: string; from: string; to: string; by: string }) => {
      setTicker(`Room ${p.number}: ${p.from} → ${p.to} (${p.by})`);
      setTimeout(() => setTicker(null), 6000);
    },
    "attendant:location": () => load(),
    "note:new": () => load(),
  });

  const byFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const room of rooms) {
      if (!map.has(room.floor)) map.set(room.floor, []);
      map.get(room.floor)!.push(room);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [rooms]);

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const releaseQueue = rooms.filter((r) => r.status === "CLEAN");
  const inspected = rooms.filter((r) => r.status === "INSPECTED").length;
  const sellable = rooms.filter((r) => !["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status)).length;
  const progress = sellable ? Math.round((inspected / sellable) * 100) : 0;

  const act = async (room: Room, status: RoomStatus, extra: Record<string, unknown> = {}) => {
    setError(null);
    try {
      await api(`/api/rooms/${room.id}/status`, { body: { status, ...extra } });
      load();
    } catch (e) {
      setError(`Room ${room.number}: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Released / sellable" value={`${inspected}/${sellable}`} />
        <Kpi label="Daily progress" value={`${progress}%`} bar={progress} />
        <Kpi label="Release queue" value={String(releaseQueue.length)} accent={releaseQueue.length >= 5} />
        <Kpi label="Blocked" value={String(rooms.filter((r) => r.status === "BLOCKED").length)} />
      </div>

      {ticker && (
        <div className="mb-3 rounded-lg border border-gold/40 bg-parchment px-4 py-2 text-sm">⚡ {ticker}</div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div>
          {/* Legend */}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {LEGEND.map((s) => (
              <span key={s} className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 shadow-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                {STATUS_LABELS[s]}
              </span>
            ))}
          </div>

          {/* Floor grid */}
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
                      onClick={() => setSelected(room)}
                      className={`relative flex h-16 flex-col items-center justify-center rounded-lg border-b-4 text-sm font-semibold shadow-sm active:scale-95 ${STATUS_STYLES[room.status].tile}`}
                      title={`${room.number} — ${STATUS_LABELS[room.status]}`}
                    >
                      {room.number}
                      <span className="text-[9px] font-normal opacity-80">
                        {room.status === "BLOCKED" ? room.blockReason : room.section}
                      </span>
                      {room.arrivals.some((a) => a.vip) && (
                        <span className="absolute left-1 top-0.5 text-[10px]">★</span>
                      )}
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

        {/* Right rail */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-serif text-xl">Release queue</h3>
            {releaseQueue.length === 0 && <p className="text-sm text-graphite/60">Nothing waiting for inspection.</p>}
            <div className="space-y-2">
              {releaseQueue.map((room) => (
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
                      className="h-12 rounded-lg bg-emerald-600 text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      ✓ Inspect &amp; release
                    </button>
                    <button
                      onClick={() => {
                        const note = window.prompt(`Rework note for room ${room.number}:`);
                        if (note?.trim()) act(room, "PICKUP", { note });
                      }}
                      className="h-12 rounded-lg border-2 border-orange-500 text-sm font-semibold text-orange-700 active:scale-[0.98]"
                    >
                      ↩ Rework
                    </button>
                  </div>
                </div>
              ))}
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
          onClose={() => setSelected(null)}
          onAct={act}
          onReload={load}
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
          <div className="h-full rounded-full bg-gold" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

function RoomDrawer({
  room,
  attendants,
  isDutyManager,
  onClose,
  onAct,
  onReload,
}: {
  room: Room;
  attendants: Attendant[];
  isDutyManager: boolean;
  onClose: () => void;
  onAct: (room: Room, status: RoomStatus, extra?: Record<string, unknown>) => Promise<void>;
  onReload: () => void;
}) {
  const [noteBody, setNoteBody] = useState("");
  const style = STATUS_STYLES[room.status];

  const addNote = async () => {
    if (!noteBody.trim()) return;
    await api(`/api/rooms/${room.id}/notes`, { body: { body: noteBody } });
    setNoteBody("");
    onReload();
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

        {/* Supervisor actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {room.status === "CLEAN" && (
            <>
              <button onClick={() => onAct(room, "INSPECTED")} className="col-span-2 h-14 rounded-xl bg-emerald-600 text-lg font-semibold text-white">
                ✓ Inspect &amp; release
              </button>
              <button
                onClick={() => {
                  const note = window.prompt("Rework note for the attendant:");
                  if (note?.trim()) onAct(room, "PICKUP", { note });
                }}
                className="col-span-2 h-12 rounded-xl border-2 border-orange-500 font-medium text-orange-700"
              >
                ↩ Send back (rework)
              </button>
            </>
          )}
          {room.status === "INSPECTED" && (
            <button onClick={() => onAct(room, "DIRTY")} className="col-span-2 h-12 rounded-xl border-2 border-red-400 font-medium text-red-700">
              Set DIRTY (new checkout)
            </button>
          )}
          {["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(room.status) ? (
            <button onClick={() => onAct(room, "DIRTY")} className="col-span-2 h-12 rounded-xl border-2 border-charcoal/30 font-medium">
              Return to inventory (DIRTY)
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  const hours = window.prompt("Out of order for how many hours?", "48");
                  const parsed = Number(hours);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    onAct(room, "OUT_OF_ORDER", { oooUntil: new Date(Date.now() + parsed * 3600_000).toISOString() });
                  }
                }}
                className="h-12 rounded-xl border-2 border-gray-400 text-sm font-medium text-gray-700"
              >
                Set OOO…
              </button>
              <button onClick={() => onAct(room, "OUT_OF_SERVICE")} className="h-12 rounded-xl border-2 border-gray-300 text-sm font-medium text-gray-600">
                Set OOS
              </button>
            </>
          )}
        </div>

        {/* Assignment */}
        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Assigned attendant</label>
          <select
            value={room.assignedTo?.id ?? ""}
            onChange={async (e) => {
              await api(`/api/rooms/${room.id}/assign`, { body: { attendantId: e.target.value || null } });
              onReload();
            }}
            className="h-12 w-full rounded-lg border border-charcoal/20 bg-white px-3"
          >
            <option value="">— unassigned —</option>
            {attendants.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Arrivals */}
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

        {/* Defects */}
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

        {/* Notes */}
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
            <button onClick={addNote} className="h-12 rounded-lg bg-charcoal px-4 text-ivory">Add</button>
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
