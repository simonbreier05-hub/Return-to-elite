import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinToday } from "@/lib/import/businessDay";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";

/**
 * POST /api/rooms/[id]/checkout — Front Office oder Supervisor (Duty Manager immer) meldet: der abreisende Gast eines
 * Turns/einer Abreise heute ist ausgecheckt. Planung L1 (Regel 7): erst dann rückt ein Turn in der Housekeeper-Liste vor
 * die Bleiber (`src/lib/planung/listOrder.ts`). Setzt den abreisenden Aufenthalt auf CHECKED_OUT und das Zimmer auf frei;
 * Logbuch und Meldung ohne Gastdaten (nur Zimmer). Der Opera-Import überschreibt das nicht automatisch neu (Regel 14).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const date = berlinToday();
  const plan = await prisma.dayRoomPlan.findUnique({ where: { date_roomId: { date, roomId: id } } });
  if (!plan || (plan.cleaningType !== "SAME_DAY_TURN" && plan.cleaningType !== "DEPARTURE") || !plan.stayId) {
    return NextResponse.json({ error: "Heute keine Abreise in diesem Zimmer.", code: "NO_DEPARTURE_TODAY" }, { status: 409 });
  }
  await prisma.stay.update({ where: { id: plan.stayId }, data: { status: "CHECKED_OUT" } });
  const room = await prisma.room.update({ where: { id }, data: { occupancy: "VACANT" } });
  await audit({ action: "GUEST_CHECKED_OUT", userId: auth.session.userId, roomId: id, meta: { date } });
  broadcast("room:update", { room });
  await notifyHousekeeperOfRoomChange({ roomId: id, kind: "PRIORITY", actorId: auth.session.userId }).catch(() => null);
  return NextResponse.json({ ok: true });
}
