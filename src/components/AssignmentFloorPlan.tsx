"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import PlanningFloorPlanPanel from "@/components/PlanningFloorPlanPanel";
import RedistributionCards from "@/components/RedistributionCards";

interface DayInfo { date: string; today: string; actionableRoomIds: string[]; attendants: { id: string; name: string }[] }

/**
 * Die einzige Zuteilungsansicht (nur Supervisor/Duty Manager): Grundriss oder Liste je Zimmermädchen, beide Zuteilungsmodi.
 * Liest und schreibt dieselbe Wahrheit wie alle anderen Ansichten (Room.assignedToId); Änderungen melden die Betroffenen
 * über notifyReassignment (Server), und alle offenen Ansichten laden live nach.
 */
export default function AssignmentFloorPlan() {
  const [day, setDay] = useState<DayInfo | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(() => api<DayInfo>("/api/assignments/day").then(setDay).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); setVersion((v) => v + 1); }, 1200);
  useSocket({ "assignments:applied": () => soon(), "room:update": () => soon(), "dayplan:updated": () => soon() });

  if (!day) return null;
  return (
    <div>
      <RedistributionCards />
      <PlanningFloorPlanPanel key={version} onShiftAttendants={day.attendants} actionableRoomIds={day.actionableRoomIds} />
    </div>
  );
}
