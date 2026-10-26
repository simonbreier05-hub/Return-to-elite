"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import FloorPlanGrid, { FloorPlanLegend, type FloorPlanResponse } from "@/components/FloorPlanGrid";
import AssignmentFloorPlan from "@/components/AssignmentFloorPlan";
import { roomDayCategory } from "@/lib/rooms/roomDayCategory";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";

interface LiveRoom {
  id: string;
  number: string;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  blockReason?: string | null;
  arrivals: { guestName: string }[];
  guestDndActive?: boolean;
}

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
function ReferenceFloorPlan() {
  const [plan, setPlan] = useState<FloorPlanResponse | null>(null);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [hub, setHub] = useState<HubState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      api<FloorPlanResponse>("/api/floor-plan"),
      // allFloors=1: this is a hotel-wide wayfinding reference, not "my work
      // area" — a floor-scoped supervisor still needs the whole floor plan.
      api<{ rooms: LiveRoom[]; hub?: HubState }>("/api/rooms?allFloors=1"),
    ])
      .then(([planData, roomsData]) => {
        setPlan(planData);
        setLiveRooms(roomsData.rooms);
        setHub(roomsData.hub ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, []);

  const liveByNumber = useMemo(() => new Map(liveRooms.map((r) => [r.number, r])), [liveRooms]);

  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
  if (!plan) return <p className="text-sm text-graphite/60">Loading floor plan…</p>;

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

      <HubMissingNotice hub={hub} planner />
      <div className="mb-4 rounded-xl border border-gold-line/40 bg-parchment/60 p-3 text-xs text-graphite/70">
        <strong>Staff &amp; housekeeping always arrive on a floor via the SVC (service) lift.</strong>{" "}
        Everything a room attendant needs is kept in the HSK office marked <strong>★ primary</strong> below —
        it is always the one positioned at that SVC lift, not any other HSK/storage room on the floor.
      </div>

      {/* Legend — wraps rather than scrolling out of view; each floor's own
          room grid below scrolls horizontally on its own if a section ever
          runs wider than a narrow screen (see the per-section overflow-x-auto
          wrapper), so this never needs to be pinned in place itself. */}
      <FloorPlanLegend className="mb-4" occupiedLabel="Occupied" guestDndLabel="Guest: Do Not Disturb" />

      <FloorPlanGrid
        plan={plan}
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
            occupancy: live?.occupancy,
            isCheckoutToday: live?.isCheckoutToday ?? false,
            guestDndActive: live?.guestDndActive ?? false,
            title:
              [
                live?.guestDndActive && "Guest: Do Not Disturb",
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

/** Supervisor/Duty Manager: die einzige Zuteilungsansicht. Alle anderen Rollen: nur der Grundriss als Orientierung — ohne Zuteilungen. */
export default function FloorPlanView({ canAssign }: { canAssign: boolean }) {
  return canAssign ? <AssignmentFloorPlan /> : <ReferenceFloorPlan />;
}
