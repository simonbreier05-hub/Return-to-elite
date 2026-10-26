"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import PlanningFloorPlanPanel from "@/components/PlanningFloorPlanPanel";
import { useLocale } from "@/lib/i18n/LocaleContext";
import RedistributionCards from "@/components/RedistributionCards";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";

interface DayInfo { date: string; today: string; actionableRoomIds: string[]; attendants: { id: string; name: string }[]; roster: { id: string; name: string; absent: boolean }[]; hub?: HubState }

/**
 * Die einzige Zuteilungsansicht (nur Supervisor/Duty Manager): Grundriss oder Liste je Zimmermädchen, beide Zuteilungsmodi.
 * Liest und schreibt dieselbe Wahrheit wie alle anderen Ansichten (Room.assignedToId); Änderungen melden die Betroffenen
 * über notifyReassignment (Server), und alle offenen Ansichten laden live nach.
 */
export default function AssignmentFloorPlan() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<DayInfo | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(() => api<DayInfo>("/api/assignments/day").then(setDay).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); setVersion((v) => v + 1); }, 1200);
  useSocket({ "assignments:applied": () => soon(), "room:update": () => soon(), "dayplan:updated": () => soon() });

  const toggle = async (id: string, absent: boolean) => {
    setError(null);
    try { await api(`/api/housekeepers/${id}/absent`, { body: { absent } }); await load(); setVersion((v) => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (!day) return null;
  return (
    <div>
      <HubMissingNotice hub={day.hub} planner />
      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card" aria-label={t("planning.presentTitle")}>
        <h3 className="font-serif text-xl">{t("planning.presentTitle")}</h3>
        <p className="mb-2 text-xs text-graphite/60">{t("planning.presentHint")}</p>
        <div className="flex flex-wrap gap-2">
          {day.roster.map((h) => (
            <button key={h.id} type="button" aria-pressed={!h.absent} onClick={() => void toggle(h.id, !h.absent)}
              className={`min-h-11 rounded-full border px-4 text-sm ${h.absent ? "border-status-out-of-order/40 bg-status-out-of-order/10 text-status-out-of-order line-through" : "border-charcoal/15 bg-white"}`}>
              {h.name}{h.absent ? ` · ${t("planning.presentOff")}` : ""}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-status-out-of-order">{error}</p>}
      </section>
      <RedistributionCards />
      <PlanningFloorPlanPanel reloadToken={version} onShiftAttendants={day.attendants} actionableRoomIds={day.actionableRoomIds} />
    </div>
  );
}
