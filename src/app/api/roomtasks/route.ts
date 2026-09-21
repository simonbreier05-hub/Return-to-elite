import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { RoomTaskTypeSchema } from "@/lib/domain";
import { createRoomTask } from "@/lib/rooms/createRoomTask";

/** GET /api/roomtasks — the houseman queue (visible to all authenticated roles, like /api/workorders). */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const roomTasks = await prisma.roomTask.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      room: { select: { id: true, number: true, floor: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ roomTasks });
}

/**
 * POST /api/roomtasks — a supervisor hands the houseman a furniture/bed job
 * (e.g. "room 207 to twin"). Analogous to defect reporting, but no photo,
 * category or engineering routing — see the RoomTask model for why this
 * stays a separate, deliberately minimal model.
 */
const Body = z.object({
  roomId: z.string().min(1),
  type: RoomTaskTypeSchema,
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor", "duty_manager"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid room task." }, { status: 400 });
  const { roomId, type, note } = parsed.data;
  if (type === "SONSTIGES" && !note?.trim()) {
    return NextResponse.json({ error: "A note is required for type SONSTIGES." }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, number: true } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const roomTask = await createRoomTask({
    room,
    type,
    note: note?.trim() || null,
    createdById: auth.session.userId,
  });

  return NextResponse.json({ roomTask }, { status: 201 });
}
