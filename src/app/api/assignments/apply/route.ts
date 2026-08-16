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
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { assignments } = parsed.data;
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

  await prisma.$transaction(
    assignments.map((a) =>
      prisma.room.updateMany({ where: { id: { in: a.roomIds } }, data: { assignedToId: a.attendantId } })
    )
  );

  await audit({
    action: "ASSIGNMENT_PLAN_APPLIED",
    userId: auth.session.userId,
    meta: {
      attendants: assignments.map((a) => ({ attendantId: a.attendantId, rooms: a.roomIds.length })),
      totalRooms: roomIds.length,
    },
  });

  // One broadcast for the whole plan; boards refetch once instead of 145 times.
  broadcast("assignments:applied", {
    by: auth.session.name,
    totalRooms: roomIds.length,
    attendantIds,
  });

  return NextResponse.json({ ok: true, roomsAssigned: roomIds.length });
}
