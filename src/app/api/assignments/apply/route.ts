import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * POST /api/assignments/apply — writes an accepted plan.
 *
 * The supervisor stays in control: the planner only proposes, this endpoint
 * commits, and every change lands in the audit log. Applied in one transaction
 * so a half-written plan can never reach the floor.
 */
const Body = z.object({
  assignments: z
    .array(
      z.object({
        attendantId: z.string().min(1),
        roomIds: z.array(z.string().min(1)),
      })
    )
    .min(1),
  /** Rooms the plan being applied set aside for capacity (see
   * splitForCapacity) — stamped deferredSince so the handover can call
   * them out by name instead of silently mixing them into "still dirty". */
  deferredRoomIds: z.array(z.string().min(1)).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { assignments, deferredRoomIds = [] } = parsed.data;
  const attendantIds = [...new Set(assignments.map((a) => a.attendantId))];
  const roomIds = assignments.flatMap((a) => a.roomIds);

  if (new Set(roomIds).size !== roomIds.length) {
    return NextResponse.json({ error: "A room may only be assigned to one attendant." }, { status: 400 });
  }

  const attendants = await prisma.user.findMany({ where: { id: { in: attendantIds } } });
  if (attendants.length !== attendantIds.length || attendants.some((a) => a.role !== "room_attendant")) {
    return NextResponse.json({ error: "Every attendantId must reference a room attendant." }, { status: 400 });
  }

  const knownRooms = await prisma.room.count({ where: { id: { in: roomIds } } });
  if (knownRooms !== roomIds.length) {
    return NextResponse.json({ error: "One or more rooms no longer exist." }, { status: 404 });
  }

  // A room can't be both assigned today and pushed to tomorrow at once.
  const deferredIds = [...new Set(deferredRoomIds)].filter((id) => !roomIds.includes(id));
  const now = new Date();

  // Per-room updates (not updateMany) because each room also gets its
  // position in the attendant's running order — the plan's roomIds are
  // already priority/floor/section-walked (see planAssignments), so that
  // position becomes the attendant's starting Laufplan, freely
  // reorderable afterwards via /api/rooms/reorder. Any of them carrying a
  // stale deferredSince from a previous day's plan is cleared here too —
  // being assigned today means it is no longer "pushed to tomorrow".
  await prisma.$transaction([
    ...assignments.flatMap((a) =>
      a.roomIds.map((roomId, index) =>
        prisma.room.update({
          where: { id: roomId },
          data: { assignedToId: a.attendantId, routeOrder: index, deferredSince: null },
        })
      )
    ),
    ...(deferredIds.length
      ? [prisma.room.updateMany({ where: { id: { in: deferredIds } }, data: { deferredSince: now } })]
      : []),
  ]);

  await audit({
    action: "ASSIGNMENT_PLAN_APPLIED",
    userId: auth.session.userId,
    meta: {
      attendants: assignments.map((a) => ({ attendantId: a.attendantId, rooms: a.roomIds.length })),
      totalRooms: roomIds.length,
      deferredRooms: deferredIds.length,
    },
  });

  // One broadcast for the whole plan; boards refetch once instead of 145 times.
  broadcast("assignments:applied", {
    by: auth.session.name,
    totalRooms: roomIds.length,
    attendantIds,
  });

  return NextResponse.json({ ok: true, roomsAssigned: roomIds.length, roomsDeferred: deferredIds.length });
}
