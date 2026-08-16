import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { computePriority } from "@/lib/priority/computePriority";
import { predictCleaningMinutes } from "@/lib/priority/predictCleaningMinutes";
import { planAssignments } from "@/lib/assignment/planAssignments";

/**
 * POST /api/assignments/plan — builds a morning proposal. Read-only: nothing
 * is written until the supervisor applies it via /api/assignments/apply.
 */
const Body = z
  .object({
    attendantIds: z.array(z.string()).optional(),
    capacityMinutes: z.number().int().positive().max(1440).optional(),
  })
  .optional();

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan options." }, { status: 400 });
  const opts = parsed.data ?? {};

  const settings = await getSettings();
  const now = new Date();

  const attendants = await prisma.user.findMany({
    where: {
      role: "room_attendant",
      ...(opts.attendantIds?.length ? { id: { in: opts.attendantIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, section: true },
  });

  const rooms = await prisma.room.findMany({
    orderBy: { number: "asc" },
    include: {
      arrivals: { where: { status: "EXPECTED" } },
      excursions: { where: { endsAt: { gte: now } } },
    },
  });

  // Urgency and predicted duration come from the same explainable modules the
  // rest of the app uses, so the plan cannot drift from the live board.
  const assignable = rooms.map((room) => ({
    id: room.id,
    number: room.number,
    floor: room.floor,
    section: room.section,
    status: room.status,
    estimatedMinutes: predictCleaningMinutes(
      { type: room.type, isCheckoutToday: room.isCheckoutToday, baseCleanMinutes: room.baseCleanMinutes },
      { stayLengthNights: 2 }
    ),
    priorityScore: computePriority(
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
        blockedRecheckMinutes: settings.blockedRecheckMinutes,
      }
    ).score,
  }));

  const plan = planAssignments(
    assignable,
    attendants.map((a) => ({ id: a.id, name: a.name, preferredSection: a.section })),
    { capacityMinutes: opts.capacityMinutes }
  );

  // Room detail the planning board needs to render the proposal.
  const roomDetail = Object.fromEntries(
    assignable.map((r) => [r.id, { number: r.number, floor: r.floor, section: r.section, minutes: r.estimatedMinutes }])
  );

  return NextResponse.json({ plan, rooms: roomDetail, computedAt: now.toISOString() });
}
