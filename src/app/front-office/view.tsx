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
  const [readyCount, setReadyCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ arrivals: Arrival[]; readyForArrival: number }>("/api/arrivals");
    setArrivals(data.arrivals);
    setReadyCount(data.readyForArrival);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({
    "arrival:update": () => load(),
    "room:update": () => load(),
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
      await api(`/api/arrivals/${id}`, { method: "PATCH", body });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const expected = arrivals.filter((a) => a.status === "EXPECTED");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl">Arrivals</h2>
          <p className="text-sm text-graphite/70">
            <strong className="text-emerald-700">{readyCount}</strong> of {expected.length} expected arrivals ready
            (room INSPECTED)
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="h-12 rounded-xl bg-charcoal px-5 font-medium text-ivory active:scale-[0.98]"
        >
          + New arrival
        </button>
      </div>

      {released && (
        <div className="mb-4 rounded-xl border border-emerald-400 bg-emerald-50 p-4 text-emerald-900">
          🛎 {released}
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

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
                    {a.status === "CHECKED_IN" && <span className="ml-2 text-xs text-emerald-700">checked in</span>}
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
                        className="h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-30"
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

      {showForm && <NewArrivalModal onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />}
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
            ? "border-red-500 bg-red-500 text-white"
            : "border-gold bg-gold text-white"
          : "border-charcoal/20 text-graphite/60"
      }`}
    >
      {label}
    </button>
  );
}

function NewArrivalModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
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
      await api("/api/arrivals", { body: { roomNumber, guestName, eta: etaIso, vip, earlyCheckIn, neededNow } });
      onDone();
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
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="h-12 rounded-xl border border-charcoal/20">Cancel</button>
          <button onClick={submit} disabled={busy || !roomNumber || !guestName}
            className="h-12 rounded-xl bg-charcoal font-medium text-ivory disabled:opacity-40">
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
