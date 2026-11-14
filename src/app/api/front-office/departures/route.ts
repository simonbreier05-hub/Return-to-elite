import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { hubDay } from "@/lib/dayplan/hubDay";
import { shortGuestName } from "@/lib/lists/guestName";
import { isCheckedOut } from "@/lib/planung/listOrder";

/**
 * GET /api/front-office/departures — Betrieb L2 (Punkt 3): heutige Abreisen und Turns für das Front Office
 * (Duty Manager immer, Supervisor zum Mitlesen). Je Zimmer: Art, Gast nur als Kurzname, ausgecheckt?, Late Check-out,
 * Zimmerstatus. Ohne Tagesplan für heute leer (`hubDay`), nie ein älterer Tag.
 */
export async function GET() {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  const hub = await hubDay();
  if (!hub.ready || !hub.date) return NextResponse.json({ date: null, departures: [] });
  const plans = await prisma.dayRoomPlan.findMany({
    where: { date: hub.date, cleaningType: { in: ["DEPARTURE", "SAME_DAY_TURN"] } },
    include: { room: { select: { id: true, number: true, floor: true, status: true } } },
  });
  const stays = await prisma.stay.findMany({ where: { id: { in: plans.map((p) => p.stayId).filter((x): x is string => !!x) } } });
  const stayBy = new Map(stays.map((s) => [s.id, s]));
  const departures = plans
    .map((p) => {
      const stay = p.stayId ? stayBy.get(p.stayId) : undefined;
      return {
        roomId: p.room.id, number: p.room.number, floor: p.room.floor, status: p.room.status, kind: p.cleaningType,
        guest: stay ? shortGuestName(stay.guestName, stay.source) : null,
        checkedOut: isCheckedOut(stay), lateCheckout: p.lateCheckout, lateCheckoutManual: p.lateCheckoutManual,
      };
    })
    .sort((a, b) => Number(a.checkedOut) - Number(b.checkedOut) || a.number.localeCompare(b.number));
  return NextResponse.json({ date: hub.date, departures });
}
