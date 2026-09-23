"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { DAY_CATEGORY_STYLES } from "@/components/status";
import FloorPlanGrid, { DAY_CATEGORIES, type FloorPlanResponse } from "@/components/FloorPlanGrid";
import { roomDayCategory } from "@/lib/rooms/roomDayCategory";

interface LiveRoom {
  id: string;
  number: string;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  blockReason?: string | null;
  assignedTo?: { id: string; name: string } | null;
  arrivals: { guestName: string }[];
}

interface Attendant {
  id: string;
  name: string;
}

type AssignMode = "room-first" | "housekeeper-first";

/**
 * Floor plan (v1) extended for v4 Aufgabe D: a live status-colour overlay
 * (Anreise/Abreise/Bleiber/Same-Day-Turn/DND, five categories, always paired
 * with a text label so colour is never the only signal) plus two assignment
 * modes that share one selection and one assign action, so they can never
 * disagree — room→housekeeper (pick rooms, then who) and
 * housekeeper→rooms (pick who, then rooms).
 *
 * The floor-plan API (src/lib/floorplan/hotelDeRome.ts /
 * /api/floor-plan) only ever carried static layout facts — wayfinding,
 * interconnecting doors, disabled/allergic flags — never live room status.
 * Rather than duplicate the room query there, live status is fetched from
 * the existing /api/rooms and merged in here by room number.
 */
export default function FloorPlanView() {
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<AssignMode>("room-first");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetAttendantId, setTargetAttendantId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      api<FloorPlanResponse>("/api/floor-plan"),
      // allFloors=1: this is a hotel-wide wayfinding reference, not "my work
      // area" — a floor-scoped supervisor still needs the whole floor plan.
      api<{ rooms: LiveRoom[]; attendants: Attendant[] }>("/api/rooms?allFloors=1"),
    ])
      .then(([planData, roomsData]) => {
        setPlan(planData);
        setLiveRooms(roomsData.rooms);
        setAttendants(roomsData.attendants);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, []);

  const liveByNumber = useMemo(() => new Map(liveRooms.map((r) => [r.number, r])), [liveRooms]);

  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
  if (!plan) return <p className="text-sm text-graphite/60">Loading floor plan…</p>;

  const toggleRoom = (number: string) => {
    setAssignResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  /**
   * The one assignment action both modes share (see module doc) — a loop
   * over the existing single-room assign endpoint, which already enforces
   * "one attendant per room" server-side, so the two entry points can never
   * produce a contradictory assignment.
   */
  const assignSelected = async (attendantId: string) => {
    if (selected.size === 0 || !attendantId) return;
    setAssigning(true);
    setAssignResult(null);
    setError(null);
    const numbers = [...selected];
    let ok = 0;
    for (const number of numbers) {
      const live = liveByNumber.get(number);
      if (!live) continue;
      try {
        await api(`/api/rooms/${live.id}/assign`, { body: { attendantId } });
        ok++;
      } catch {
        // continue with the rest; report the shortfall below
      }
    }
    setAssigning(false);
    const attendantName = attendants.find((a) => a.id === attendantId)?.name ?? "";
    setAssignResult(
      ok === numbers.length
        ? `✓ ${ok} room${ok === 1 ? "" : "s"} assigned to ${attendantName}.`
        : `${ok} of ${numbers.length} rooms assigned to ${attendantName}; the rest failed.`
    );
    setSelected(new Set());
    setTargetAttendantId("");
    load();
  };

  return (
    <div className="animate-rise">
      <div className="mb-5">
        <h2 className="font-serif text-4xl leading-none">Floor Plan</h2>
        <div className="rule-gold my-2 w-40" />
        <p className="text-sm text-graphite/70">
          Digitized from the housekeeping floor-plan binder — wayfinding, HSK &amp; service-lift
          locations, room flags, and today&apos;s live status for every floor.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-gold-line/40 bg-parchment/60 p-3 text-xs text-graphite/70">
        <strong>Staff &amp; housekeeping always arrive on a floor via the SVC (service) lift.</strong>{" "}
        Everything a room attendant needs is kept in the HSK office marked <strong>★ primary</strong> below —
        it is always the one positioned at that SVC lift, not any other HSK/storage room on the floor.
      </div>

      {/* Legend — wraps rather than scrolling out of view; each floor's own
          room grid below scrolls horizontally on its own if a section ever
          runs wider than a narrow screen (see the per-section overflow-x-auto
          wrapper), so this never needs to be pinned in place itself. */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-charcoal/10 bg-linen/95 p-3 text-xs shadow-card">
        {DAY_CATEGORIES.map((c) => {
          const style = DAY_CATEGORY_STYLES[c];
          return (
            <span key={c} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${style.chip}`}>
              <span className={`h-2 w-2 rounded-full ${style.dot}`} />
              {style.label}
            </span>
          );
        })}
      </div>

      <AssignmentPanel
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setSelected(new Set());
          setTargetAttendantId("");
          setAssignResult(null);
        }}
        attendants={attendants}
        selectedCount={selected.size}
        targetAttendantId={targetAttendantId}
        onTargetAttendantChange={setTargetAttendantId}
        assigning={assigning}
        onAssign={() => assignSelected(mode === "housekeeper-first" ? targetAttendantId : targetAttendantId)}
        onClearSelection={() => setSelected(new Set())}
        result={assignResult}
      />

      <FloorPlanGrid
        plan={plan}
        onRoomClick={(r) => toggleRoom(r.number)}
        getRoomMeta={(r) => {
          const live = liveByNumber.get(r.number);
          const category = live
            ? roomDayCategory({
                occupancy: live.occupancy ?? "VACANT",
                isCheckoutToday: live.isCheckoutToday,
                blockReason: live.blockReason,
                hasExpectedArrival: live.arrivals.length > 0,
              })
            : "NONE";
          return {
            category,
            selected: selected.has(r.number),
            badge: live?.assignedTo?.name.split(" ")[0],
            title:
              [
                live?.assignedTo && `Assigned to ${live.assignedTo.name}`,
                r.interconnectingGroup && `Interconnecting with ${r.interconnectingGroup}`,
                r.hasDisabledAccess && "Room for disabled",
                r.isAntiAllergic && "Anti-allergic",
                r.hasTerrace && "Has terrace",
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          };
        }}
      />
    </div>
  );
}

/**
 * The two assignment modes (v4 Aufgabe D): "room-first" picks rooms on the
 * grid below, then an attendant here; "housekeeper-first" picks the
 * attendant first, framing every room tap below as "assign to them". Both
 * write through the same `onAssign`, so there is exactly one way a room
 * actually gets reassigned from this screen.
 */
function AssignmentPanel({
  mode,
  onModeChange,
  attendants,
  selectedCount,
  targetAttendantId,
  onTargetAttendantChange,
  assigning,
  onAssign,
  onClearSelection,
  result,
}: {
  mode: AssignMode;
  onModeChange: (mode: AssignMode) => void;
  attendants: Attendant[];
  selectedCount: number;
  targetAttendantId: string;
  onTargetAttendantChange: (id: string) => void;
  assigning: boolean;
  onAssign: () => void;
  onClearSelection: () => void;
  result: string | null;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-charcoal/10 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => onModeChange("room-first")}
          className={`h-11 rounded-lg border px-3 text-sm font-medium ${
            mode === "room-first" ? "border-gold bg-parchment" : "border-charcoal/15 bg-white"
          }`}
        >
          Rooms → housekeeper
        </button>
        <button
          onClick={() => onModeChange("housekeeper-first")}
          className={`h-11 rounded-lg border px-3 text-sm font-medium ${
            mode === "housekeeper-first" ? "border-gold bg-parchment" : "border-charcoal/15 bg-white"
          }`}
        >
          Housekeeper → rooms
        </button>
      </div>

      {mode === "room-first" ? (
        <p className="mb-2 text-xs text-graphite/60">
          Tap rooms below to select them, then choose who they go to. {selectedCount} room{selectedCount === 1 ? "" : "s"} selected.
        </p>
      ) : (
        <p className="mb-2 text-xs text-graphite/60">
          Pick a housekeeper, then tap the rooms they should take. {selectedCount} room{selectedCount === 1 ? "" : "s"} selected.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={targetAttendantId}
          onChange={(e) => onTargetAttendantChange(e.target.value)}
          aria-label="Select housekeeper to assign selected rooms to"
          className="h-11 rounded-lg border border-charcoal/20 bg-white px-3 text-sm"
        >
          <option value="">— select housekeeper —</option>
          {attendants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          onClick={onAssign}
          disabled={assigning || selectedCount === 0 || !targetAttendantId}
          className="h-11 rounded-lg bg-navy px-4 text-sm font-semibold text-ivory transition hover:bg-navy-line disabled:opacity-40"
        >
          {assigning ? "Assigning…" : `Assign ${selectedCount || ""} room${selectedCount === 1 ? "" : "s"}`}
        </button>
        {selectedCount > 0 && (
          <button onClick={onClearSelection} className="h-11 rounded-lg border border-charcoal/15 px-4 text-sm">
            Clear selection
          </button>
        )}
      </div>

      {result && (
        <p className="mt-2 rounded-lg border border-status-clean/30 bg-status-clean/10 px-3 py-2 text-sm text-status-clean">
          {result}
        </p>
      )}
    </div>
  );
}
