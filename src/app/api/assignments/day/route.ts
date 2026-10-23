import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";
import { latestPlanDate } from "@/lib/dayplan/latest";

/**
 * GET /api/assignments/day — Grundlage für die Zuteilung im Grundriss: welche Zimmer heute zu reinigen sind
 * (Tagesplan: Abreise, Turn, Bleiber) und welche Zimmermädchen heute anwesend sind. Nur Supervisor/Duty Manager.
 * Eine Quelle für „zu reinigen“ (DayRoomPlan) — dieselbe wie der Zuteilungsvorschlag.
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const today = berlinDate(new Date());
  const date = (await latestPlanDate()) ?? today;
  const plan = await prisma.dayRoomPlan.findMany({ where: { date, cleaningType: { in: ["DEPARTURE", "SAME_DAY_TURN", "STAYOVER"] } }, select: { roomId: true } });
  const roster = (await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, select: { id: true, name: true, absentDate: true }, orderBy: { name: "asc" } }))
    .map((u) => ({ id: u.id, name: u.name, absent: u.absentDate === today }));
  const attendants = roster.filter((u) => !u.absent).map(({ id, name }) => ({ id, name }));
  return NextResponse.json({ date, today, actionableRoomIds: plan.map((p) => p.roomId), attendants, roster });
}
