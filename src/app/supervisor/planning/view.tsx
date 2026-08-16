"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import Modal from "@/components/Modal";

interface Attendant {
  id: string;
  name: string;
  section?: string | null;
}

interface RoomDetail {
  number: string;
  floor: number;
  section: string;
  minutes: number;
}

interface Assignment {
  attendantId: string;
  attendantName: string;
  roomIds: string[];
  totalMinutes: number;
  roomCount: number;
  floors: number[];
  sections: string[];
  load: number;
  overbooked: boolean;
  reasons: string[];
}

interface Plan {
  assignments: Assignment[];
  unassigned: { roomId: string; number: string; reason: string }[];
  summary: {
    totalRooms: number;
    totalMinutes: number;
    averageMinutes: number;
    spreadMinutes: number;
    capacityMinutes: number;
  };
}

const SHIFT_PRESETS = [
  { label: "Short · 4 h", minutes: 240 },
  { label: "Standard · 6.5 h", minutes: 390 },
  { label: "Long · 8 h", minutes: 480 },
];

const fmt = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;

export default function PlanningView() {
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [onShift, setOnShift] = useState<Set<string>>(new Set());
  const [capacity, setCapacity] = useState(390);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [rooms, setRooms] = useState<Record<string, RoomDetail>>({});
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ roomId: string; fromId: string } | null>(null);

  useEffect(() => {
    api<{ attendants: Attendant[] }>("/api/rooms")
      .then((d) => {
        setAttendants(d.attendants);
        setOnShift(new Set(d.attendants.map((a) => a.id)));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const createPlan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      const res = await api<{ plan: Plan; rooms: Record<string, RoomDetail> }>("/api/assignments/plan", {
        body: { attendantIds: [...onShift], capacityMinutes: capacity },
      });
      setPlan(res.plan);
      setRooms(res.rooms);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [onShift, capacity]);

  /** Moving a room is a local edit; nothing is written until Apply. */
  const moveRoom = (roomId: string, fromId: string, toId: string) => {
    setPlan((prev) => {
      if (!prev || fromId === toId) return prev;
      const minutes = rooms[roomId]?.minutes ?? 0;
      return {
        ...prev,
        assignments: prev.assignments.map((a) => {
          if (a.attendantId === fromId) {
            const roomIds = a.roomIds.filter((r) => r !== roomId);
            return recalc(a, roomIds, a.totalMinutes - minutes, prev.summary.capacityMinutes);
          }
          if (a.attendantId === toId) {
            return recalc(a, [...a.roomIds, roomId], a.totalMinutes + minutes, prev.summary.capacityMinutes);
          }
          return a;
        }),
      };
    });
    setMoving(null);
  };

  const recalc = (a: Assignment, roomIds: string[], totalMinutes: number, cap: number): Assignment => {
    const floors = [...new Set(roomIds.map((id) => rooms[id]?.floor).filter((f): f is number => f != null))].sort();
    return {
      ...a,
      roomIds,
      totalMinutes,
      roomCount: roomIds.length,
      floors,
      load: cap > 0 ? totalMinutes / cap : 0,
      overbooked: totalMinutes > cap,
      reasons: [...a.reasons.filter((r) => !r.startsWith("Adjusted")), "Adjusted by hand before applying."].filter(
        (r, i, arr) => arr.indexOf(r) === i
      ),
    };
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ roomsAssigned: number }>("/api/assignments/apply", {
        body: {
          assignments: plan.assignments
            .filter((a) => a.roomIds.length > 0)
            .map((a) => ({ attendantId: a.attendantId, roomIds: a.roomIds })),
        },
      });
      setApplied(`${res.roomsAssigned} rooms assigned. The team sees their list immediately.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const live = useMemo(() => plan?.assignments.filter((a) => a.roomCount > 0) ?? [], [plan]);
  const spread = useMemo(() => {
    if (!live.length) return 0;
    const m = live.map((a) => a.totalMinutes);
    return Math.max(...m) - Math.min(...m);
  }, [live]);

  return (
    // Bottom padding keeps the last cards clear of the sticky apply bar.
    <div className="animate-rise pb-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">Morning Planning</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">
            Balanced by predicted cleaning time, kept within sections to save walking.
          </p>
        </div>
        <Link
          href="/supervisor"
          className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
        >
          ← Live board
        </Link>
      </div>

      {/* Step 1 — who is on shift */}
      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <h3 className="mb-1 font-serif text-xl">1 · Who is on shift?</h3>
        <p className="mb-3 text-sm text-graphite/60">Tap to include or exclude. Preferred sections are honoured.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {attendants.map((a) => {
            const on = onShift.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() =>
                  setOnShift((prev) => {
                    const next = new Set(prev);
                    if (next.has(a.id)) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  })
                }
                className={`h-14 rounded-xl border px-5 text-left transition ${
                  on ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white opacity-50"
                }`}
              >
                <div className="text-sm font-semibold">{a.name}</div>
                <div className="text-xs text-graphite/60">{a.section ? `prefers ${a.section}` : "no preference"}</div>
              </button>
            );
          })}
        </div>

        <h3 className="mb-1 font-serif text-xl">2 · Shift length</h3>
        <div className="mb-4 flex flex-wrap gap-2">
          {SHIFT_PRESETS.map((p) => (
            <button
              key={p.minutes}
              onClick={() => setCapacity(p.minutes)}
              className={`h-12 rounded-xl border px-5 text-sm font-medium transition ${
                capacity === p.minutes ? "border-gold-line bg-parchment font-semibold" : "border-charcoal/15 bg-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={createPlan}
          disabled={busy || onShift.size === 0}
          className="h-14 w-full rounded-xl bg-charcoal text-base font-semibold tracking-wide text-ivory transition hover:bg-espresso disabled:opacity-40 sm:w-auto sm:px-10"
        >
          {busy ? "Calculating…" : plan ? "Recalculate proposal" : "Create proposal"}
        </button>
        {onShift.size === 0 && <p className="mt-2 text-sm text-amber-700">Select at least one attendant.</p>}
      </section>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {applied && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">✓ {applied}</div>
      )}

      {plan && (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Rooms to clean" value={String(plan.summary.totalRooms)} />
            <Stat label="Total work" value={fmt(plan.summary.totalMinutes)} />
            <Stat label="Average per person" value={fmt(plan.summary.averageMinutes)} />
            <Stat
              label="Spread busiest ↔ quietest"
              value={`${spread} min`}
              tone={spread > 90 ? "warn" : "good"}
            />
          </section>

          <div className="mb-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {live.map((a) => (
              <AttendantCard
                key={a.attendantId}
                assignment={a}
                rooms={rooms}
                capacity={plan.summary.capacityMinutes}
                onMoveRoom={(roomId) => setMoving({ roomId, fromId: a.attendantId })}
              />
            ))}
          </div>

          {plan.unassigned.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              {plan.unassigned.length} rooms could not be placed: {plan.unassigned[0].reason}
            </div>
          )}

          <div className="sticky bottom-3 rounded-2xl border border-charcoal/10 bg-linen/95 p-4 shadow-lift backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-graphite/70">
                Nothing is saved yet — review the proposal, move rooms if you like, then apply.
              </p>
              <button
                onClick={apply}
                disabled={busy}
                className="h-14 rounded-xl bg-gold px-8 text-base font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
              >
                {busy ? "Applying…" : "Apply plan to the team"}
              </button>
            </div>
          </div>
        </>
      )}

      {moving && plan && (
        <Modal
          title={`Move room ${rooms[moving.roomId]?.number ?? ""}`}
          subtitle="Pick who should take it instead."
          onClose={() => setMoving(null)}
        >
          <div className="grid gap-2">
            {plan.assignments.map((a) => (
              <button
                key={a.attendantId}
                onClick={() => moveRoom(moving.roomId, moving.fromId, a.attendantId)}
                disabled={a.attendantId === moving.fromId}
                className="flex h-14 items-center justify-between rounded-xl border border-charcoal/15 px-4 text-left hover:border-gold-line disabled:opacity-40"
              >
                <span className="font-medium">{a.attendantName}</span>
                <span className="text-sm text-graphite/60">
                  {a.roomCount} rooms · {fmt(a.totalMinutes)}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{label}</div>
      <div
        className={`mt-1 font-serif text-3xl ${
          tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function AttendantCard({
  assignment,
  rooms,
  capacity,
  onMoveRoom,
}: {
  assignment: Assignment;
  rooms: Record<string, RoomDetail>;
  capacity: number;
  onMoveRoom: (roomId: string) => void;
}) {
  // The house is read floor by floor, so the plan is grouped that way too.
  const byFloor = useMemo(() => {
    const map = new Map<number, { id: string; detail: RoomDetail }[]>();
    for (const id of assignment.roomIds) {
      const detail = rooms[id];
      if (!detail) continue;
      if (!map.has(detail.floor)) map.set(detail.floor, []);
      map.get(detail.floor)!.push({ id, detail });
    }
    for (const list of map.values()) list.sort((a, b) => a.detail.number.localeCompare(b.detail.number));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [assignment.roomIds, rooms]);

  const pct = Math.min(100, Math.round(assignment.load * 100));

  return (
    <div className="rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h4 className="font-serif text-2xl">{assignment.attendantName}</h4>
        <span className={`text-sm font-semibold ${assignment.overbooked ? "text-red-700" : "text-graphite/70"}`}>
          {fmt(assignment.totalMinutes)} / {fmt(capacity)}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-parchment">
        <div
          className={`h-full rounded-full transition-all ${assignment.overbooked ? "bg-red-600" : "bg-gold"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-graphite/60">
        {assignment.roomCount} rooms · {assignment.sections.join(", ")}
      </p>

      <div className="mt-3 space-y-2">
        {byFloor.map(([floor, list]) => (
          <div key={floor}>
            <div className="mb-1 text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">
              Floor {floor} · {list.length} rooms
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map(({ id, detail }) => (
                <button
                  key={id}
                  onClick={() => onMoveRoom(id)}
                  title={`${detail.number} · ~${detail.minutes} min — tap to move`}
                  className="h-10 rounded-lg border border-charcoal/15 bg-white px-2.5 text-sm font-medium tabular-nums hover:border-gold-line"
                >
                  {detail.number}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-gold">Why this split?</summary>
        <ul className="mt-2 space-y-1 rounded-lg border border-gold-line/40 bg-ivory p-3 text-xs text-graphite">
          {assignment.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
