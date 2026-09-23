"use client";

import Collapsible from "@/components/Collapsible";
import { DAY_CATEGORY_STYLES } from "@/components/status";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";

export interface RoomFlags {
  number: string;
  floor: number;
  section: string;
  interconnectingGroup: string | null;
  hasDisabledAccess: boolean;
  isAntiAllergic: boolean;
  hasTerrace: boolean;
}

export interface Facility {
  id: string;
  floor: number;
  type: string;
  label: string;
  isPrimaryHsk: boolean;
  nearRoom: string | null;
  notes: string | null;
}

export interface WayfindingLeg {
  range: string;
  side: "links" | "rechts";
  note?: string;
}

export interface FloorPlanResponse {
  floors: number[];
  rooms: RoomFlags[];
  facilities: Facility[];
  wayfinding: Record<number, { straight: WayfindingLeg[]; right: WayfindingLeg[] }>;
}

/** Per-room presentation, computed by the caller from whatever live data it has. */
export interface RoomMeta {
  category: RoomDayCategory;
  /** Highlighted with a ring — "this room matters to what I'm doing right now". */
  selected?: boolean;
  /** Small dashed marker — "actionable today, nobody owns it yet". */
  unassignedActionable?: boolean;
  /** Short text next to the room number, e.g. the assigned attendant's first name. */
  badge?: string;
  title?: string;
}

export const DAY_CATEGORIES: RoomDayCategory[] = ["ARRIVAL", "DEPARTURE", "STAYOVER", "SAME_DAY_TURN", "DND"];

const FACILITY_ICON: Record<string, string> = {
  HSK: "🧺",
  SVC_LIFT: "🛎️",
  GUEST_LIFT: "🛗",
  FIRE_ESCAPE: "🚪",
  LOBBY: "🏛️",
  EVENT_SPACE: "🎭",
  TERRACE: "🌿",
};

/**
 * The floor-by-floor grid (wayfinding, facilities, room boxes) shared by the
 * hotel-wide floor-plan reference page and the supervisor's grundriss-based
 * planning panel. Purely presentational — day-status colour, selection ring,
 * and per-room badges all come from `getRoomMeta`, so each caller decides
 * what a room's shading and marker mean without this component knowing about
 * plans, attendants, or assignment state.
 */
export default function FloorPlanGrid({
  plan,
  getRoomMeta,
  onRoomClick,
}: {
  plan: FloorPlanResponse;
  getRoomMeta: (room: RoomFlags) => RoomMeta;
  onRoomClick?: (room: RoomFlags) => void;
}) {
  const roomsByFloor = new Map<number, RoomFlags[]>();
  for (const r of plan.rooms) {
    if (!roomsByFloor.has(r.floor)) roomsByFloor.set(r.floor, []);
    roomsByFloor.get(r.floor)!.push(r);
  }
  const facilitiesByFloor = new Map<number, Facility[]>();
  for (const f of plan.facilities) {
    if (!facilitiesByFloor.has(f.floor)) facilitiesByFloor.set(f.floor, []);
    facilitiesByFloor.get(f.floor)!.push(f);
  }

  return (
    <>
      {plan.floors.map((floor, i) => {
        const rooms = (roomsByFloor.get(floor) ?? []).sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true })
        );
        const facilities = facilitiesByFloor.get(floor) ?? [];
        const primaryHsk = facilities.find((f) => f.type === "HSK" && f.isPrimaryHsk);
        const wayfinding = plan.wayfinding[floor];
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

            <div className="grid gap-3 sm:grid-cols-2">
              {[...sections.entries()].map(([section, secRooms]) => (
                <div key={section} className="overflow-x-auto rounded-lg border border-charcoal/10 bg-white p-3">
                  <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-graphite/50">
                    Section {section}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {secRooms.map((r) => {
                      const meta = getRoomMeta(r);
                      const style = DAY_CATEGORY_STYLES[meta.category];
                      return (
                        <button
                          key={r.number}
                          type="button"
                          onClick={() => onRoomClick?.(r)}
                          title={meta.title}
                          className={`relative flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border px-2.5 text-xs transition active:scale-95 ${style.chip} ${
                            meta.selected ? "ring-2 ring-navy ring-offset-1" : ""
                          }`}
                        >
                          {r.number}
                          {r.hasDisabledAccess && "♿"}
                          {r.isAntiAllergic && "🌼"}
                          {r.interconnectingGroup && "🔗"}
                          {r.hasTerrace && "🌿"}
                          {meta.badge && <span className="text-[0.6rem] opacity-70">· {meta.badge}</span>}
                          {meta.unassignedActionable && (
                            <span
                              aria-hidden
                              className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-dashed border-status-dirty bg-white"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        );
      })}
    </>
  );
}
