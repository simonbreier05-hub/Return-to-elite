import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getPriorityWeights, getSettings } from "@/lib/settings";
import { computePriority } from "@/lib/priority/computePriority";
import { predictCleaningMinutes } from "@/lib/priority/predictCleaningMinutes";
import { planAssignments } from "@/lib/assignment/planAssignments";
import { computeStaffingNeed, splitForCapacity, type StaffingConfig } from "@/lib/assignment/staffing";
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

  // The house starts every plan from a 100%-clean baseline — the day's real
  // workload is whoever is actually staying, checking out or checking in
  // today (stayovers + departures + arrivals, isHousekeepingRelevant's own
  // definition, one count per room), full stop. That is what "belegte
  // Zimmer" subtracts from the clean baseline, not a live read of whichever
  // rooms still happen to say DIRTY right now. The distinction matters: a
  // status-filtered count shrinks all morning as attendants tick rooms off,
  // which would silently understate staffing need by early afternoon even
  // though those finished rooms were real work somebody did today. This
  // count stays the same from 07:00 to 19:00 — it is today's occupancy, not
  // today's remaining status board.
  const occupiedRooms = classifiable.filter(isHousekeepingRelevant);
  const departureIds = classifyDepartures(occupiedRooms, figures.departures);
  const warnings = checkDayFigures(figures, rooms.length, occupiedRooms.length);

  // The status board still decides what actually gets *assigned* below —
  // there is no reason to hand an attendant a room that is already CLEAN or
  // INSPECTED, occupied or not. NEEDS_WORK only narrows the assignment step;
  // it never narrows the staffing count above.
  const actionableRooms = occupiedRooms.filter((r) => NEEDS_WORK.has(r.status));

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
      // A departure only carries a real deadline when someone is actually
      // booked into it later today — that guest is what makes it
      // time-critical. A checkout with no same-day arrival is no more urgent
      // than a stayover; see splitForCapacity for where this matters.
      isUrgentTurnover: departureIds.has(room.id) && room.arrivals.length > 0,
      estimatedMinutes: predictCleaningMinutes(
        { type: room.type, isCheckoutToday: departureIds.has(room.id), baseCleanMinutes: room.baseCleanMinutes },
        { stayLengthNights: 2 }
      ),
      priorityScore,
    }));

  // --- Staffing: is this even something the pool can cover today? ---------
  // planAssignments() balances whatever it is handed and flags overbooking —
  // it never drops a room. That is still right for "I picked 3 attendants
  // for a big house, warn me." This is the layer above it: given the
  // realistic envelope of the house — tunable in Settings, defaults to 4-10
  // attendants at 10-12 rooms each — decide up front whether today's demand
  // fits at all, and if it does not, which rooms make today's cut. A
  // same-day turnover is kept back only once every other room already is.
  const staffingConfig: StaffingConfig = {
    roomsPerAttendantMin: settings.roomsPerAttendantMin,
    roomsPerAttendantMax: settings.roomsPerAttendantMax,
    attendantPoolMax: settings.attendantPoolMax,
  };
  // Staffing itself is sized off the full-day occupancy baseline (see
  // occupiedRooms above) — how many hands today's actual guests require,
  // not how many rooms happen to still say DIRTY at the moment someone
  // opens this screen. Which specific rooms get deferred when that's too
  // many, though, can only ever be ones still on the table — see workable.
  const workable = assignable.filter((r) => NEEDS_WORK.has(r.status));
  const staffing = computeStaffingNeed(occupiedRooms.length, staffingConfig);
  const { deferred } = splitForCapacity(workable, staffing.realisticCapacity);
  const deferredIds = new Set(deferred.map((r) => r.id));
  const assignableForPlan = assignable.filter((r) => !deferredIds.has(r.id));

  const plan = planAssignments(
    assignableForPlan,
    attendants.map((a) => ({ id: a.id, name: a.name, preferredSection: a.section })),
    { capacityMinutes: opts.capacityMinutes, maxRoomsPerAttendant: settings.roomsPerAttendantMax }
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
    roomsNeedingWork: occupiedRooms.length,
    stillActionable: actionableRooms.length,
    staffing,
    deferredRooms: deferred.map((r) => ({
      roomId: r.id,
      number: r.number,
      isDeparture: r.isDeparture,
    })),
    computedAt: now.toISOString(),
  });
}
