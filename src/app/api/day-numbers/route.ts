import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { hubDay } from "@/lib/dayplan/hubDay";
import { getDayNumbers } from "@/lib/dayplan/dayNumbersData";
import { teamIdsFor } from "@/lib/autoplan/load";

/**
 * GET /api/day-numbers — die eine Zahlenquelle des Arbeitstags (Belegt/Zu reinigen/Zugeteilt/Gereinigt/Offen/Wäschewechsel).
 * Nur Supervisor/Duty Manager. `rows` sind die Grundlage für Live-Neuberechnung im Browser (computeDayNumbers).
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const hub = await hubDay();
  if (!hub.ready) return NextResponse.json({ hub, numbers: null, rows: [] });
  const team = await teamIdsFor(hub.date);
  const { rows, numbers } = await getDayNumbers(hub.date, team);
  return NextResponse.json({ hub, numbers, rows });
}
