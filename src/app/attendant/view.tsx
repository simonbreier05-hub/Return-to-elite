"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { STATUS_STYLES } from "@/components/status";
import { STATUS_LABELS, BLOCK_REASONS, DEFECT_CATEGORIES, type RoomStatus } from "@/lib/domain";

interface Room {
  id: string;
  number: string;
  floor: number;
  section: string;
  type: string;
  status: RoomStatus;
  reworkNote?: string | null;
  blockReason?: string | null;
  isCheckoutToday: boolean;
  notes: { id: string; body: string; author: { name: string; role: string }; createdAt: string }[];
}

interface Priority {
  roomId: string;
  score: number;
  reasons: { signal: string; points: number; reason: string }[];
  estimatedMinutes: number;
}

export default function AttendantView() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});
  const [modal, setModal] = useState<{ kind: "block" | "defect" | "note"; room: Room } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [roomData, prioData] = await Promise.all([
      api<{ rooms: Room[] }>("/api/rooms?mine=1"),
      api<{ priorities: Priority[] }>("/api/priority"),
    ]);
    setRooms(roomData.rooms);
    setPriorities(Object.fromEntries(prioData.priorities.map((p) => [p.roomId, p])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({ "room:update": () => load(), "note:new": () => load() });

  const setStatus = async (room: Room, status: RoomStatus, extra: Record<string, unknown> = {}) => {
    setError(null);
    try {
      await api(`/api/rooms/${room.id}/status`, { body: { status, ...extra } });
      load();
    } catch (e) {
      setError(`Room ${room.number}: ${(e as Error).message}`);
    }
  };

  const sorted = useMemo(
    () => [...rooms].sort((a, b) => (priorities[b.id]?.score ?? -1) - (priorities[a.id]?.score ?? -1)),
    [rooms, priorities]
  );

  const done = rooms.filter((r) => r.status === "INSPECTED").length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-3xl">My Assigned Rooms</h2>
          <p className="text-sm text-graphite/70">
            Sorted by priority · {done}/{rooms.length} released
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((room) => {
          const prio = priorities[room.id];
          const style = STATUS_STYLES[room.status];
          return (
            <div key={room.id} className="rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <span className="font-serif text-3xl">{room.number}</span>
                  <span className="ml-2 text-xs uppercase tracking-wider text-graphite/50">
                    {room.type.replace(/_/g, " ")}
                    {room.isCheckoutToday && " · due-out"}
                  </span>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${style.chip}`}>
                  {STATUS_LABELS[room.status]}
                </span>
              </div>

              {prio && prio.score > 0 && (
                <button
                  onClick={() => setWhyOpen(whyOpen === room.id ? null : room.id)}
                  className="mb-2 flex w-full items-center justify-between rounded-lg bg-parchment px-3 py-2 text-left text-sm"
                >
                  <span>
                    Priority <strong>{prio.score}</strong> · ~{prio.estimatedMinutes} min
                  </span>
                  <span className="text-gold">{whyOpen === room.id ? "hide why ▲" : "why? ▼"}</span>
                </button>
              )}
              {whyOpen === room.id && prio && (
                <ul className="mb-2 space-y-1 rounded-lg border border-gold/30 bg-ivory p-3 text-xs text-graphite">
                  {prio.reasons.map((r, i) => (
                    <li key={i}>
                      <span className="font-semibold text-gold">+{r.points}</span> {r.reason}
                    </li>
                  ))}
                </ul>
              )}

              {room.status === "PICKUP" && room.reworkNote && (
                <div className="mb-2 rounded-lg border border-orange-300 bg-orange-50 p-2 text-sm text-orange-900">
                  <strong>Rework:</strong> {room.reworkNote}
                </div>
              )}
              {room.status === "BLOCKED" && (
                <div className="mb-2 rounded-lg border border-purple-300 bg-purple-50 p-2 text-sm text-purple-900">
                  Blocked: {room.blockReason?.replace(/_/g, " ")}
                </div>
              )}
              {room.notes[0] && (
                <p className="mb-2 truncate text-xs text-graphite/60" title={room.notes[0].body}>
                  📝 {room.notes[0].author.name}: {room.notes[0].body}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {(room.status === "DIRTY" || room.status === "PICKUP") && (
                  <button
                    onClick={() => setStatus(room, "IN_PROGRESS")}
                    className="col-span-2 h-14 rounded-xl bg-blue-600 text-lg font-semibold text-white active:scale-[0.98]"
                  >
                    ▶ Start cleaning
                  </button>
                )}
                {room.status === "BLOCKED" && (
                  <button
                    onClick={() => setStatus(room, "IN_PROGRESS")}
                    className="col-span-2 h-14 rounded-xl bg-blue-600 text-lg font-semibold text-white active:scale-[0.98]"
                  >
                    ▶ Unblock &amp; start
                  </button>
                )}
                {room.status === "IN_PROGRESS" && (
                  <button
                    onClick={() => setStatus(room, "CLEAN")}
                    className="col-span-2 h-14 rounded-xl bg-yellow-400 text-lg font-semibold text-charcoal active:scale-[0.98]"
                  >
                    ✓ Mark clean · to inspect
                  </button>
                )}
                {["DIRTY", "IN_PROGRESS", "PICKUP"].includes(room.status) && (
                  <button
                    onClick={() => setModal({ kind: "block", room })}
                    className="h-12 rounded-xl border-2 border-purple-500 text-sm font-medium text-purple-700 active:scale-[0.98]"
                  >
                    ⛔ Blocked…
                  </button>
                )}
                <button
                  onClick={() => setModal({ kind: "defect", room })}
                  className="h-12 rounded-xl border-2 border-amber-500 text-sm font-medium text-amber-700 active:scale-[0.98]"
                >
                  🔧 Defect…
                </button>
                <button
                  onClick={() => setModal({ kind: "note", room })}
                  className="col-span-2 h-11 rounded-xl border border-charcoal/20 text-sm text-graphite active:scale-[0.98]"
                >
                  📝 Add note
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modal?.kind === "block" && (
        <BlockModal
          room={modal.room}
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await setStatus(modal.room, "BLOCKED", { blockReason: reason });
            setModal(null);
          }}
        />
      )}
      {modal?.kind === "defect" && (
        <DefectModal room={modal.room} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
      {modal?.kind === "note" && (
        <NoteModal room={modal.room} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-2xl">{title}</h3>
          <button onClick={onClose} className="h-11 w-11 rounded-lg hover:bg-parchment">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BlockModal({ room, onClose, onSubmit }: { room: { number: string }; onClose: () => void; onSubmit: (reason: string) => void }) {
  const labels: Record<string, string> = {
    DND: "🚪 Do Not Disturb",
    GUEST_IN_ROOM: "🧍 Guest in room",
    DOUBLE_LOCKED: "🔒 Double locked",
    REFUSED: "🙅 Service refused",
  };
  return (
    <ModalFrame title={`Block room ${room.number}`} onClose={onClose}>
      <div className="grid gap-2">
        {BLOCK_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => onSubmit(r)}
            className="h-14 rounded-xl border-2 border-purple-400 text-base font-medium text-purple-800 hover:bg-purple-50"
          >
            {labels[r]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-graphite/60">A re-check reminder and escalation timer starts automatically.</p>
    </ModalFrame>
  );
}

function DefectModal({ room, onClose, onDone }: { room: { id: string; number: string }; onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState<string>("PLUMBING");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
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
    <ModalFrame title={`Report defect · ${room.number}`} onClose={onClose}>
      <label className="mb-1 block text-sm font-medium">Category</label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {DEFECT_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`h-11 rounded-lg border text-sm ${
              category === c ? "border-gold bg-parchment font-semibold" : "border-charcoal/15"
            }`}
          >
            {c.replace(/_/g, " / ")}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-sm font-medium">Description</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        className="mb-3 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
        placeholder="What is broken?"
      />
      <label className="mb-1 block text-sm font-medium">Photo (optional)</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        className="mb-4 w-full text-sm"
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !note.trim()}
        className="h-14 w-full rounded-xl bg-amber-600 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Sending…" : "Send to engineering"}
      </button>
    </ModalFrame>
  );
}

function NoteModal({ room, onClose, onDone }: { room: { id: string; number: string }; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ModalFrame title={`Note · room ${room.number}`} onClose={onClose}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="mb-3 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
        placeholder="Visible to all departments…"
      />
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/rooms/${room.id}/notes`, { body: { body } });
            onDone();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || !body.trim()}
        className="h-12 w-full rounded-xl bg-charcoal text-base font-medium text-ivory disabled:opacity-40"
      >
        Save note
      </button>
    </ModalFrame>
  );
}
