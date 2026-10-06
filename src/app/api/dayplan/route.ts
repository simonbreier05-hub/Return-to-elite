import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { compareWithForecast, type DayCleaningType } from "@/lib/dayplan/derive";

/** GET /api/dayplan?date= — gespeicherter Tagesplan mit Kennzahlen (Standard: Tag der letzten Departures). */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date") ?? (await latestPlanDate());
  if (!date) return NextResponse.json({ date: null, rooms: [], figures: null, issues: [] });

  const rows = await prisma.dayRoomPlan.findMany({
    where: { date }, orderBy: { room: { number: "asc" } },
    include: { room: { select: { number: true, floor: true, assignedToId: true } } },
  });
  const count = (...t: DayCleaningType[]) => rows.filter((r) => t.includes(r.cleaningType as DayCleaningType)).length;
  const departures = count("DEPARTURE", "SAME_DAY_TURN"), stayovers = count("STAYOVER"), arrivals = count("ARRIVAL", "SAME_DAY_TURN");
  const figures = { departures, arrivals, stayovers, eveningOccupancy: stayovers + arrivals, cleaningCount: departures + stayovers };
  const fc = await prisma.forecastDay.findUnique({ where: { date } });
  const issues = compareWithForecast(figures, fc ? { date, occupiedRooms: fc.occupiedRooms, arrivals: fc.arrivals, departures: fc.departures } : null);
  const openTraces = await prisma.trace.groupBy({ by: ["roomId"], where: { status: "OPEN" }, _count: true });
  const traceCount = new Map(openTraces.map((t) => [t.roomId, t._count]));
  return NextResponse.json({
    date, figures, issues,
    rooms: rows.map((r) => ({
      room: r.room.number, floor: r.room.floor, cleaningType: r.cleaningType, derivedType: r.derivedType, overridden: r.typeOverridden,
      laundryDue: r.laundryDue, nights: r.nights, vip: r.vip, eta: r.eta, assigned: !!r.room.assignedToId, openTraces: traceCount.get(r.roomId) ?? 0,
    })),
  });
}
