import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { getPriorityWeights, getSettings } from "@/lib/settings";
import { computePriority } from "@/lib/priority/computePriority";
import { predictCleaningMinutes } from "@/lib/priority/predictCleaningMinutes";

/**
 * GET /api/priority — dynamic, explainable cleaning priority for every
 * actionable room. Optional ?attendantId= tunes the route-proximity signal
 * to that attendant's live location.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const attendantId =
    req.nextUrl.searchParams.get("attendantId") ??
    (auth.session.role === "room_attendant" ? auth.session.userId : null);

  let attendantSection: string | null = null;
  let attendantFloor: number | null = null;
  if (attendantId) {
    const attendant = await prisma.user.findUnique({ where: { id: attendantId } });
    if (attendant?.currentRoomId) {
      const loc = await prisma.room.findUnique({ where: { id: attendant.currentRoomId } });
      attendantSection = loc?.section ?? null;
      attendantFloor = loc?.floor ?? null;
    } else if (attendant?.section) {
      attendantSection = attendant.section;
      attendantFloor = parseInt(attendant.section, 10) || null;
    }
  }

  const settings = await getSettings();
  const weights = await getPriorityWeights();
  const now = new Date();
  const rooms = await prisma.room.findMany({
    where: { status: { in: ["DIRTY", "IN_PROGRESS", "PICKUP", "BLOCKED", "CLEAN"] } },
    include: {
      arrivals: { where: { status: "EXPECTED" } },
      excursions: { where: { endsAt: { gte: now } } },
    },
  });

  const results = rooms
    .map((room) => {
      const priority = computePriority(
        {
          id: room.id,
          number: room.number,
          floor: room.floor,
          section: room.section,
          status: room.status,
          isCheckoutToday: room.isCheckoutToday,
          blockedSince: room.blockedSince,
        },
        {
          now,
          arrivals: room.arrivals.map((a) => ({
            eta: a.eta, vip: a.vip, earlyCheckIn: a.earlyCheckIn, neededNow: a.neededNow,
          })),
          excursions: room.excursions.map((e) => ({ startsAt: e.startsAt, endsAt: e.endsAt })),
          attendantSection,
          attendantFloor,
          blockedRecheckMinutes: settings.blockedRecheckMinutes,
          weights,
        }
      );
      const estimatedMinutes = predictCleaningMinutes(
        { type: room.type, isCheckoutToday: room.isCheckoutToday, baseCleanMinutes: room.baseCleanMinutes },
        { stayLengthNights: 2 } // TODO(ml): pull real guest profile from PMS
      );
      return {
        roomId: room.id,
        number: room.number,
        floor: room.floor,
        section: room.section,
        status: room.status,
        score: priority.score,
        reasons: priority.reasons,
        estimatedMinutes,
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ priorities: results, computedAt: now.toISOString() });
}
