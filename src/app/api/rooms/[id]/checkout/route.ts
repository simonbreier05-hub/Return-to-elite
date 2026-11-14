import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinToday } from "@/lib/import/businessDay";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";
import { notifyFloorSupervisors } from "@/lib/rooms/notifyFloorSupervisors";
import { keyed } from "@/lib/i18n/notificationText";

/**
 * POST /api/rooms/[id]/checkout — Front Office oder Supervisor (Duty Manager immer) meldet: der abreisende Gast eines
 * Turns/einer Abreise heute ist ausgecheckt. Planung L1 (Regel 7): erst dann rückt ein Turn in der Housekeeper-Liste vor
 * die Bleiber (`src/lib/planung/listOrder.ts`). Setzt den abreisenden Aufenthalt auf CHECKED_OUT und das Zimmer auf frei;
 * Logbuch und Meldung ohne Gastdaten (nur Zimmer). Der Opera-Import überschreibt das nicht automatisch neu (Regel 14).
 * Betrieb L2 (Punkt 3): gemeldet werden die zuständige Housekeeperin (dringend, eigene Art) und die Supervisoren der Etage
 * (der Duty Manager sieht alle Meldungen). Zweimal melden ändert nichts.
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
  const stay = await prisma.stay.findUnique({ where: { id: plan.stayId }, select: { status: true } });
  if (stay?.status === "CHECKED_OUT") return NextResponse.json({ ok: true, already: true });
  await prisma.stay.update({ where: { id: plan.stayId }, data: { status: "CHECKED_OUT" } });
  const room = await prisma.room.update({ where: { id }, data: { occupancy: "VACANT" } });
  await audit({ action: "GUEST_CHECKED_OUT", userId: auth.session.userId, roomId: id, meta: { date } });
  broadcast("room:update", { room });
  broadcast("dayplan:updated", { date, changedRooms: [room.number] });
  await notifyHousekeeperOfRoomChange({ roomId: id, kind: "CHECKED_OUT", actorId: auth.session.userId }).catch(() => null);
  await notifyFloorSupervisors({
    room: { id: room.id, number: room.number, floor: room.floor }, actorId: auth.session.userId, type: "GUEST_CHECKED_OUT", level: "warning",
    message: `Zimmer ${room.number} (Etage ${room.floor}): Gast ausgecheckt.`,
    k: keyed("notify.guestCheckedOut", { n: room.number, floor: room.floor }),
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}
