import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { ELEVATOR_WAYFINDING, HOTEL } from "@/lib/domain";

/**
 * GET /api/floor-plan — the digitized Hotel de Rome floor plan: every room's
 * wayfinding section and special flags, the non-lettable floor facilities
 * (HSK offices, lifts, fire escapes), and the elevator wayfinding card.
 * Open to any authenticated role — front office and engineering need to find
 * a room just as much as housekeeping does.
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const [rooms, facilities] = await Promise.all([
    prisma.room.findMany({
      select: {
        number: true,
        floor: true,
        section: true,
        interconnectingGroup: true,
        hasDisabledAccess: true,
        isAntiAllergic: true,
        hasTerrace: true,
      },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    }),
    prisma.floorFacility.findMany({ orderBy: [{ floor: "asc" }, { type: "asc" }] }),
  ]);

  return NextResponse.json({
    floors: HOTEL.floors,
    rooms,
    facilities,
    wayfinding: ELEVATOR_WAYFINDING,
  });
}
