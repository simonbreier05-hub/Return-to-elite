import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { hubDay } from "@/lib/dayplan/hubDay";
import { getDayNumbers, getDayNumbersWithFloors } from "@/lib/dayplan/dayNumbersData";
import { teamIdsFor } from "@/lib/autoplan/load";
import { parseAssignedFloors } from "@/lib/floors";

/**
 * GET /api/day-numbers — die eine Zahlenquelle des Arbeitstags (Belegt/Zu reinigen/Zugeteilt/Gereinigt/Offen/Wäschewechsel).
 * Nur Supervisor/Duty Manager. `rows` sind die Grundlage für Live-Neuberechnung im Browser (computeDayNumbers).
 * Für einen Supervisor zusätzlich `mine` = dieselben Zahlen nur für seine zugeteilten Etagen (`floors: []`, `numbers: null`,
 * solange er keine Etagen hat). Die Hauszahlen (`numbers`) bleiben für alle gleich.
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const hub = await hubDay();
  const isSup = auth.session.role === "supervisor";
  if (!hub.ready) return NextResponse.json({ hub, numbers: null, rows: [], mine: null });
  const team = await teamIdsFor(hub.date);
  if (!isSup) {
    const { rows, numbers } = await getDayNumbers(hub.date, team);
    return NextResponse.json({ hub, numbers, rows, mine: null });
  }
  const me = await prisma.user.findUnique({ where: { id: auth.session.userId }, select: { assignedFloors: true } });
  const floors = parseAssignedFloors(me?.assignedFloors);
  const { rows, numbers, mine } = await getDayNumbersWithFloors(hub.date, floors, team);
  return NextResponse.json({ hub, numbers, rows, mine: mine ?? { floors: [], numbers: null } });
}
