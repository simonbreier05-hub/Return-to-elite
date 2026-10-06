import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";

/**
 * GET /api/housekeepers — Stammdaten für den Zuteilungsvorschlag. Typ und Stufe sind Beschäftigtendaten:
 * nur Supervisor und Duty Manager, nie Housekeeper, nie in Logs.
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const today = berlinDate(new Date());
  const users = await prisma.user.findMany({
    where: { role: "room_attendant" }, orderBy: { name: "asc" },
    select: { id: true, name: true, hkType: true, hkLevel: true, homeFloors: true, dailyTarget: true, hkActive: true, absentDate: true },
  });
  return NextResponse.json({
    housekeepers: users.map(({ absentDate, ...u }) => ({ ...u, absentToday: absentDate === today })),
  });
}
