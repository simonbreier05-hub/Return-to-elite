"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import Collapsible from "@/components/Collapsible";

interface RoomFlags {
  number: string;
  floor: number;
  section: string;
  interconnectingGroup: string | null;
  hasDisabledAccess: boolean;
  isAntiAllergic: boolean;
  hasTerrace: boolean;
}

interface Facility {
  id: string;
  floor: number;
  type: string;
  label: string;
  isPrimaryHsk: boolean;
  nearRoom: string | null;
  notes: string | null;
}

interface WayfindingLeg {
  range: string;
  side: "links" | "rechts";
  note?: string;
}

interface FloorPlanResponse {
  floors: number[];
  rooms: RoomFlags[];
  facilities: Facility[];
  wayfinding: Record<number, { straight: WayfindingLeg[]; right: WayfindingLeg[] }>;
}

const FACILITY_ICON: Record<string, string> = {
  HSK: "🧺",
  SVC_LIFT: "🛎️",
  GUEST_LIFT: "🛗",
  FIRE_ESCAPE: "🚪",
  LOBBY: "🏛️",
  EVENT_SPACE: "🎭",
  TERRACE: "🌿",
};

export default function FloorPlanView() {
  const [data, setData] = useState<FloorPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<FloorPlanResponse>("/api/floor-plan")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
  if (!data) return <p className="text-sm text-graphite/60">Loading floor plan…</p>;

  const roomsByFloor = new Map<number, RoomFlags[]>();
  for (const r of data.rooms) {
    if (!roomsByFloor.has(r.floor)) roomsByFloor.set(r.floor, []);
    roomsByFloor.get(r.floor)!.push(r);
  }
  const facilitiesByFloor = new Map<number, Facility[]>();
  for (const f of data.facilities) {
    if (!facilitiesByFloor.has(f.floor)) facilitiesByFloor.set(f.floor, []);
    facilitiesByFloor.get(f.floor)!.push(f);
  }

  return (
    <div className="animate-rise">
      <div className="mb-5">
        <h2 className="font-serif text-4xl leading-none">Floor Plan</h2>
        <div className="rule-gold my-2 w-40" />
        <p className="text-sm text-graphite/70">
          Digitized from the housekeeping floor-plan binder — wayfinding, HSK &amp; service-lift
          locations, and room flags for every floor.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-gold-line/40 bg-parchment/60 p-3 text-xs text-graphite/70">
        <strong>Staff &amp; housekeeping always arrive on a floor via the SVC (service) lift.</strong>{" "}
        Everything a room attendant needs is kept in the HSK office marked <strong>★ primary</strong> below —
        it is always the one positioned at that SVC lift, not any other HSK/storage room on the floor.
        Room numbers and the elevator wayfinding are read directly off clearly legible plans; interconnecting
        groups, the disabled-access/anti-allergic rooms, and floor 5's room list are a best-effort digitization
        of hand-annotated paper plans — verify against the originals if precision matters. Room <em>type</em>
        (Classic/Deluxe/Suite tiers) is shown on the plans only as grayscale shading and could not be read
        reliably, so every room is seeded as &ldquo;Needs type (unverified)&rdquo;.
      </div>

      {data.floors.map((floor, i) => {
        const rooms = (roomsByFloor.get(floor) ?? []).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
        const facilities = facilitiesByFloor.get(floor) ?? [];
        const primaryHsk = facilities.find((f) => f.type === "HSK" && f.isPrimaryHsk);
        const wayfinding = data.wayfinding[floor];
        const sections = new Map<string, RoomFlags[]>();
        for (const r of rooms) {
          if (!sections.has(r.section)) sections.set(r.section, []);
          sections.get(r.section)!.push(r);
        }

        return (
          <Collapsible
            key={floor}
            defaultOpen={i === 0}
            summary={
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-serif text-2xl">Floor {floor}</h3>
                <span className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">{rooms.length} rooms</span>
                {primaryHsk && (
                  <span className="rounded-full bg-charcoal px-2.5 py-0.5 text-[0.68rem] font-semibold text-ivory">
                    HSK ★ near {primaryHsk.nearRoom}
                  </span>
                )}
              </div>
            }
          >
            {/* Elevator wayfinding */}
            {wayfinding && (
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-charcoal/10 bg-white p-3">
                  <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-graphite/50">
                    Aus dem Lift geradeaus
                  </div>
                  {wayfinding.straight.map((leg, idx) => (
                    <div key={idx} className="text-sm">
                      # {leg.range} <span className="text-graphite/50">{leg.side}</span>
                      {leg.note && <span className="ml-1 text-xs text-amber-700">{leg.note}</span>}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-charcoal/10 bg-white p-3">
                  <div className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-graphite/50">
                    Aus dem Lift rechts
                  </div>
                  {wayfinding.right.map((leg, idx) => (
                    <div key={idx} className="text-sm">
                      # {leg.range} <span className="text-graphite/50">{leg.side}</span>
                      {leg.note && <span className="ml-1 text-xs text-amber-700">{leg.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Facilities */}
            <div className="mb-3 flex flex-wrap gap-2">
              {facilities.map((f) => (
                <span
                  key={f.id}
                  title={f.notes ?? undefined}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    f.isPrimaryHsk ? "border-gold bg-gold/10 font-semibold text-espresso" : "border-charcoal/15 text-graphite/70"
                  }`}
                >
                  {FACILITY_ICON[f.type] ?? "•"} {f.label}
                  {f.nearRoom && ` (near ${f.nearRoom})`}
                  {f.isPrimaryHsk && " ★"}
                </span>
              ))}
            </div>

            {/* Rooms by wayfinding section */}
            <div className="grid gap-3 sm:grid-cols-2">
              {[...sections.entries()].map(([section, secRooms]) => (
                <div key={section} className="rounded-lg border border-charcoal/10 bg-white p-3">
                  <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-graphite/50">
                    Section {section}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {secRooms.map((r) => (
                      <span
                        key={r.number}
                        title={[
                          r.interconnectingGroup && `Interconnecting with ${r.interconnectingGroup}`,
                          r.hasDisabledAccess && "Room for disabled",
                          r.isAntiAllergic && "Anti-allergic",
                          r.hasTerrace && "Has terrace",
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined}
                        className="flex items-center gap-1 rounded-md border border-charcoal/10 bg-linen px-2 py-1 text-xs"
                      >
                        {r.number}
                        {r.hasDisabledAccess && "♿"}
                        {r.isAntiAllergic && "🌼"}
                        {r.interconnectingGroup && "🔗"}
                        {r.hasTerrace && "🌿"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
