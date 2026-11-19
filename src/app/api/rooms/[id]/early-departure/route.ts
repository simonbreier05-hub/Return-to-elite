import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinToday } from "@/lib/import/businessDay";
import { overrideCleaningType } from "@/lib/dayplan/merge";

/**
 * POST /api/rooms/[id]/early-departure — F3 Teil 3 (H8, entschieden: Front Office, Supervisor, Duty Manager): ein Bleiber
 * reist heute ab. Die Art wechselt von Bleiber auf Abreise (`overrideCleaningType`: als Handeingabe markiert, der nächste
 * Import überschreibt sie nicht — Regel P14) und das Abreisedatum des Aufenthalts wird heute. Danach normaler Check-out.
 * Housekeeperin und Supervisor bekommen die Meldung wie bei jeder Listenänderung. Logbuch ohne Gastdaten.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const date = berlinToday();
  const plan = await prisma.dayRoomPlan.findUnique({ where: { date_roomId: { date, roomId: id } }, include: { room: { select: { number: true } } } });
  if (!plan || plan.cleaningType !== "STAYOVER") return NextResponse.json({ error: "Heute kein Bleiber in diesem Zimmer.", code: "NOT_A_STAYOVER" }, { status: 409 });
  await overrideCleaningType(date, plan.room.number, "DEPARTURE", auth.session.userId);
  if (plan.stayId) {
    const stay = await prisma.stay.findUnique({ where: { id: plan.stayId }, select: { checkOut: true } });
    const todayNoon = new Date(`${date}T10:00:00Z`); // wie der Import (merge.ts)
    if (stay && stay.checkOut > todayNoon) await prisma.stay.update({ where: { id: plan.stayId }, data: { checkOut: todayNoon } });
  }
  const room = await prisma.room.update({ where: { id }, data: { isCheckoutToday: true } });
  await audit({ action: "EARLY_DEPARTURE", userId: auth.session.userId, roomId: id, meta: { date } });
  broadcast("room:update", { room });
  broadcast("dayplan:updated", { date, changedRooms: [room.number] });
  return NextResponse.json({ ok: true });
}
