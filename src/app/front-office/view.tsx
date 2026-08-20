"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { STATUS_STYLES } from "@/components/status";
import { STATUS_LABELS, type RoomStatus } from "@/lib/domain";

interface Arrival {
  id: string;
  guestName: string;
  eta?: string | null;
  vip: boolean;
  earlyCheckIn: boolean;
  neededNow: boolean;
  status: string;
  room: { id: string; number: string; status: RoomStatus };
}

export default function FrontOfficeView() {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ arrivals: Arrival[] }>("/api/arrivals");
    setArrivals(data.arrivals);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({
    // Patch the affected arrival instead of refetching the whole board.
    "arrival:update": (p: { arrival: Arrival }) => {
      setArrivals((prev) =>
        prev.some((a) => a.id === p.arrival.id)
          ? prev.map((a) => (a.id === p.arrival.id ? { ...a, ...p.arrival } : a))
          : [...prev, p.arrival]
      );
    },
    // A room status change only affects the room nested in each arrival row.
    "room:update": (p: { room: { id: string; status: RoomStatus } }) => {
      setArrivals((prev) =>
        prev.map((a) => (a.room.id === p.room.id ? { ...a, room: { ...a.room, status: p.room.status } } : a))
      );
    },
    "notification:new": (p: { notification?: { type: string; message: string; targetRole: string } }) => {
      if (p.notification?.type === "ROOM_RELEASED") {
        setReleased(p.notification.message);
        setTimeout(() => setReleased(null), 10_000);
      }
    },
  });

  const patch = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await api<{ arrival: Arrival }>(`/api/arrivals/${id}`, { method: "PATCH", body });
      setArrivals((prev) => prev.map((a) => (a.id === res.arrival.id ? { ...a, ...res.arrival } : a)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Derived client-side, so it stays correct after a patch without another request.
  const readyCount = arrivals.filter((a) => a.status === "EXPECTED" && a.room.status === "INSPECTED").length;

  const expected = arrivals.filter((a) => a.status === "EXPECTED");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl">Arrivals</h2>
          <p className="text-sm text-graphite/70">
            <strong className="text-status-inspected">{readyCount}</strong> of {expected.length} expected arrivals ready
            (room INSPECTED)
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          type="button"
          className="h-12 rounded-xl bg-navy px-5 font-medium text-ivory active:scale-[0.98]"
        >
          + New arrival
        </button>
      </div>

      {released && (
        <div className="mb-4 rounded-xl border border-status-inspected/30 bg-status-inspected/10 p-4 text-status-inspected">
          🛎 {released}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 p-3 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-charcoal/10 bg-white shadow-sm">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-charcoal/10 text-xs uppercase tracking-wider text-graphite/60">
            <tr>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Housekeeping</th>
              <th className="px-4 py-3">ETA</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.map((a) => {
              const ready = a.room.status === "INSPECTED";
              return (
                <tr key={a.id} className="border-b border-charcoal/5">
                  <td className="px-4 py-3 font-medium">
                    {a.vip && <span className="text-gold">★ </span>}
                    {a.guestName}
                    {a.status === "CHECKED_IN" && <span className="ml-2 text-xs text-status-inspected">checked in</span>}
                  </td>
                  <td className="px-4 py-3 font-serif text-lg">{a.room.number}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLES[a.room.status].chip}`}>
                      {STATUS_LABELS[a.room.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      defaultValue={a.eta ? new Date(a.eta).toTimeString().slice(0, 5) : ""}
                      onBlur={(e) => {
                        if (!e.target.value) return;
                        const [h, m] = e.target.value.split(":").map(Number);
                        const eta = new Date();
                        eta.setHours(h, m, 0, 0);
                        patch(a.id, { eta: eta.toISOString() });
                      }}
                      className="h-10 rounded-lg border border-charcoal/20 px-2"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Flag on={a.vip} label="VIP" onClick={() => patch(a.id, { vip: !a.vip })} />
                      <Flag on={a.earlyCheckIn} label="Early" onClick={() => patch(a.id, { earlyCheckIn: !a.earlyCheckIn })} />
                      <Flag on={a.neededNow} label="Needed now" hot onClick={() => patch(a.id, { neededNow: !a.neededNow })} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.status === "EXPECTED" && (
                      <button
                        onClick={() => patch(a.id, { status: "CHECKED_IN" })}
                        disabled={!ready}
                        title={ready ? "Check in" : "Room not yet released"}
                        className="h-10 rounded-lg bg-status-inspected px-3 text-xs font-semibold text-linen disabled:opacity-30"
                      >
                        Check in
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-graphite/50">
        Front office cannot change housekeeping status — release requires supervisor inspection. You are notified here
        the moment a requested room is released.
      </p>

      {showForm && (
        <NewArrivalModal
          onClose={() => setShowForm(false)}
          onDone={(arrival) => {
            setShowForm(false);
            setArrivals((prev) => [...prev, arrival]);
          }}
        />
      )}
    </div>
  );
}

function Flag({ on, label, hot, onClick }: { on: boolean; label: string; hot?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 rounded-full border px-3 text-xs font-medium ${
        on
          ? hot
            ? "border-status-out-of-order bg-status-out-of-order text-linen"
            : "border-gold bg-gold text-charcoal"
          : "border-charcoal/20 text-graphite/60"
      }`}
    >
      {label}
    </button>
  );
}

function NewArrivalModal({ onClose, onDone }: { onClose: () => void; onDone: (arrival: Arrival) => void }) {
  const [roomNumber, setRoomNumber] = useState("");
  const [guestName, setGuestName] = useState("");
  const [eta, setEta] = useState("");
  const [vip, setVip] = useState(false);
  const [earlyCheckIn, setEarlyCheckIn] = useState(false);
  const [neededNow, setNeededNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let etaIso: string | undefined;
      if (eta) {
        const [h, m] = eta.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        etaIso = d.toISOString();
      }
      const res = await api<{ arrival: Arrival }>("/api/arrivals", {
        body: { roomNumber, guestName, eta: etaIso, vip, earlyCheckIn, neededNow },
      });
      onDone(res.arrival);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-serif text-2xl">New arrival</h3>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Room number</label>
            <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="205"
              className="h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">ETA</label>
            <input type="time" value={eta} onChange={(e) => setEta(e.target.value)}
              className="h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
          </div>
        </div>
        <label className="mb-1 block text-sm font-medium">Guest name</label>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Dr. Amelie Winter"
          className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
        <div className="mb-4 flex gap-2">
          <Flag on={vip} label="VIP" onClick={() => setVip((v) => !v)} />
          <Flag on={earlyCheckIn} label="Early check-in" onClick={() => setEarlyCheckIn((v) => !v)} />
          <Flag on={neededNow} label="Needed now" hot onClick={() => setNeededNow((v) => !v)} />
        </div>
        {error && <p className="mb-2 text-sm text-status-out-of-order">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="h-12 rounded-xl border border-charcoal/20">Cancel</button>
          <button onClick={submit} disabled={busy || !roomNumber || !guestName}
            className="h-12 rounded-xl bg-navy font-medium text-ivory disabled:opacity-40">
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
