import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { RoomTaskStatusSchema } from "@/lib/domain";

const INCLUDE = {
  room: { select: { id: true, number: true, floor: true } },
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

/** PATCH /api/roomtasks/[id] — mark a room task DONE (the only transition; OPEN → DONE). */
const Body = z.object({ status: RoomTaskStatusSchema });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["houseman", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid room task status." }, { status: 400 });

  const existing = await prisma.roomTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Room task not found." }, { status: 404 });
  if (existing.status === "DONE") {
    return NextResponse.json({ error: "Room task is already done." }, { status: 409 });
  }
  if (parsed.data.status !== "DONE") {
    return NextResponse.json({ error: "A room task can only be marked DONE." }, { status: 409 });
  }

  const roomTask = await prisma.roomTask.update({
    where: { id },
    data: {
      status: "DONE",
      doneAt: new Date(),
      assignedToId: auth.session.role === "houseman" ? auth.session.userId : existing.assignedToId,
    },
    include: INCLUDE,
  });

  await audit({
    action: "ROOM_TASK_DONE",
    userId: auth.session.userId,
    roomId: existing.roomId,
    meta: { roomTaskId: id },
  });

  broadcast("roomtask:update", { roomTask });
  return NextResponse.json({ roomTask });
}
