import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinToday } from "@/lib/import/businessDay";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";

const Body = z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable() }).strict();

/**
 * PATCH /api/rooms/[id]/late-checkout — Betrieb L2 (Punkt 3): Front Office (Duty Manager immer) setzt den Late Check-out
 * einer heutigen Abreise/eines Turns von Hand („HH:MM“) oder nimmt ihn zurück (`null` → wieder der Wert aus dem Report beim
 * nächsten Import). Handeingabe ist `lateCheckoutManual` — der Import überschreibt sie nie. Ohne Gastdaten im Logbuch.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["front_office"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Uhrzeit.", code: "INVALID_INPUT" }, { status: 400 });
  const date = berlinToday();
  const plan = await prisma.dayRoomPlan.findUnique({ where: { date_roomId: { date, roomId: id } } });
  if (!plan || (plan.cleaningType !== "SAME_DAY_TURN" && plan.cleaningType !== "DEPARTURE")) {
    return NextResponse.json({ error: "Heute keine Abreise in diesem Zimmer.", code: "NO_DEPARTURE_TODAY" }, { status: 409 });
  }
  const { time } = parsed.data;
  await prisma.dayRoomPlan.update({ where: { id: plan.id }, data: { lateCheckout: time, lateCheckoutManual: time !== null } });
  await audit({ action: "LATE_CHECKOUT_SET", userId: auth.session.userId, roomId: id, meta: { date, time } });
  const room = await prisma.room.findUniqueOrThrow({ where: { id }, select: { number: true } });
  broadcast("dayplan:updated", { date, changedRooms: [room.number] });
  await notifyHousekeeperOfRoomChange({ roomId: id, kind: "LATE_CHECKOUT", actorId: auth.session.userId }).catch(() => null);
  return NextResponse.json({ ok: true });
}
