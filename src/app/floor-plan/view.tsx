"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import FloorPlanGrid, { FloorPlanLegend, type FloorPlanResponse } from "@/components/FloorPlanGrid";
import AssignmentFloorPlan from "@/components/AssignmentFloorPlan";
import { roomDayCategory } from "@/lib/rooms/roomDayCategory";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";

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
  const { t } = useLocale();
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
      .catch((e) => setError(errorText(e, t)));
  };

  useEffect(load, []);

  const liveByNumber = useMemo(() => new Map(liveRooms.map((r) => [r.number, r])), [liveRooms]);

  if (error) return <div className="rounded-(--glass-radius-sm) border border-red-300 bg-status-danger-bg p-3 text-sm text-status-danger-fg">{error}</div>;
  if (!plan) return <p className="text-sm text-text-muted">{t("floorPlanRef.loading")}</p>;

  return (
    <div className="theme-glass flex flex-col gap-4">
      <div className="mb-5">
        <h2 className="text-title-28 text-text-primary">{t("floorPlanRef.title")}</h2>
        
        <p className="text-sm text-text-secondary">
          {t("floorPlanRef.intro")}
        </p>
      </div>

      <HubMissingNotice hub={hub} planner />
      <div className="mb-4 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised p-3 text-xs text-text-secondary">
        <strong>{t("floorPlanRef.liftNoteStrong")}</strong> {t("floorPlanRef.liftNote")}
      </div>

      {/* Legend — wraps rather than scrolling out of view; each floor's own
          room grid below scrolls horizontally on its own if a section ever
          runs wider than a narrow screen (see the per-section overflow-x-auto
          wrapper), so this never needs to be pinned in place itself. */}
      <FloorPlanLegend className="mb-4" occupiedLabel={t("floorPlanRef.occupied")} guestDndLabel={t("floorPlanRef.guestDnd")} />

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
                live?.guestDndActive && t("floorPlanRef.guestDnd"),
                r.interconnectingGroup && t("floorPlanRef.interconnecting", { group: r.interconnectingGroup }),
                r.hasDisabledAccess && t("floorPlanRef.disabled"),
                r.isAntiAllergic && t("floorPlanRef.antiAllergic"),
                r.hasTerrace && t("floorPlanRef.terrace"),
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
