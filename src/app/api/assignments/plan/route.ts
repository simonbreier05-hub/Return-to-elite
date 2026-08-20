import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getPriorityWeights, getSettings } from "@/lib/settings";
import { computePriority } from "@/lib/priority/computePriority";
import { predictCleaningMinutes } from "@/lib/priority/predictCleaningMinutes";
import { planAssignments } from "@/lib/assignment/planAssignments";
import { computeStaffingNeed, splitForCapacity } from "@/lib/assignment/staffing";
import { TYPICAL_DAILY_ROOMS } from "@/lib/assignment/routeOrder";
import { isHousekeepingRelevant } from "@/lib/rooms/isHousekeepingRelevant";
import {
  checkDayFigures,
  classifyDepartures,
  defaultDayFigures,
  stayoversFrom,
} from "@/lib/assignment/dayFigures";

/** Mirrors the planner's own definition of a room that still needs an attendant. */
const NEEDS_WORK = new Set(["DIRTY", "PICKUP", "BLOCKED", "IN_PROGRESS"]);

/**
 * POST /api/assignments/plan — builds a morning proposal. Read-only: nothing
 * is written until the supervisor applies it via /api/assignments/apply.
 */
const Body = z
  .object({
    attendantIds: z.array(z.string()).optional(),
    capacityMinutes: z.number().int().positive().max(1440).optional(),
    /** Hand-entered night-audit figures; omitted means "use the live data". */
    dayFigures: z
      .object({
        departures: z.number().int().min(0).max(1000),
        arrivals: z.number().int().min(0).max(1000),
        eveningOccupancy: z.number().int().min(0).max(1000),
      })
      .optional(),
  })
  .optional();

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan options." }, { status: 400 });
  const opts = parsed.data ?? {};

  const settings = await getSettings();
  const weights = await getPriorityWeights();
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

  // Urgency comes from the same explainable module the rest of the app uses,
  // so the plan cannot drift from the live board.
  const scored = rooms.map((room) => ({
    room,
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
        weights,
      }
    ).score,
  }));

  // --- The day's figures ---------------------------------------------------
  // Either what the supervisor typed, or what the live data says.
  const classifiable = scored.map(({ room, priorityScore }) => ({
    id: room.id,
    number: room.number,
    status: room.status,
    isCheckoutToday: room.isCheckoutToday,
    occupancy: room.occupancy,
    priorityScore,
  }));
  const expectedArrivals = await prisma.arrival.count({ where: { status: "EXPECTED" } });
  const defaults = defaultDayFigures(classifiable, expectedArrivals);
  const figures = opts.dayFigures ?? defaults;

  // Only rooms that still need an attendant, AND that a current or departing
  // guest actually makes relevant, can be planned. A vacant room nobody is
  // staying in or checking out of today never enters the work pool — see
  // isHousekeepingRelevant for why this is a single shared gate.
  const workRooms = classifiable.filter((r) => NEEDS_WORK.has(r.status) && isHousekeepingRelevant(r));
  const departureIds = classifyDepartures(workRooms, figures.departures);
  const warnings = checkDayFigures(figures, rooms.length, workRooms.length);

  // A departure clean is substantially longer than stayover service, so the
  // split the supervisor entered is what actually moves the workload.
  const assignable = scored
    .filter(({ room }) => isHousekeepingRelevant(room))
    .map(({ room, priorityScore }) => ({
      id: room.id,
      number: room.number,
      floor: room.floor,
      section: room.section,
      status: room.status,
      isDeparture: departureIds.has(room.id),
      estimatedMinutes: predictCleaningMinutes(
        { type: room.type, isCheckoutToday: departureIds.has(room.id), baseCleanMinutes: room.baseCleanMinutes },
        { stayLengthNights: 2 }
      ),
      priorityScore,
    }));

  // --- Staffing: is this even something the pool can cover today? ---------
  // planAssignments() balances whatever it is handed and flags overbooking —
  // it never drops a room. That is still right for "I picked 3 attendants
  // for a big house, warn me." This is the layer above it: given the realistic
  // envelope of the house (4-10 attendants, 10-12 rooms each), decide up front
  // whether today's demand fits at all, and if it does not, which rooms make
  // today's cut. Departures are kept back only once every stayover already is.
  const workable = assignable.filter((r) => NEEDS_WORK.has(r.status));
  const staffing = computeStaffingNeed(workRooms.length);
  const { deferred } = splitForCapacity(workable, staffing.realisticCapacity);
  const deferredIds = new Set(deferred.map((r) => r.id));
  const assignableForPlan = assignable.filter((r) => !deferredIds.has(r.id));

  const plan = planAssignments(
    assignableForPlan,
    attendants.map((a) => ({ id: a.id, name: a.name, preferredSection: a.section })),
    { capacityMinutes: opts.capacityMinutes, maxRoomsPerAttendant: TYPICAL_DAILY_ROOMS.high }
  );

  // Room detail the planning board needs to render the proposal — including
  // deferred rooms, so the board can still show their number and floor.
  const roomDetail = Object.fromEntries(
    assignable.map((r) => [
      r.id,
      { number: r.number, floor: r.floor, section: r.section, minutes: r.estimatedMinutes, isDeparture: r.isDeparture },
    ])
  );

  return NextResponse.json({
    plan,
    rooms: roomDetail,
    figures,
    defaults,
    warnings,
    stayovers: stayoversFrom(figures),
    totalRooms: rooms.length,
    roomsNeedingWork: workRooms.length,
    staffing,
    deferredRooms: deferred.map((r) => ({
      roomId: r.id,
      number: r.number,
      isDeparture: r.isDeparture,
    })),
    computedAt: now.toISOString(),
  });
}
