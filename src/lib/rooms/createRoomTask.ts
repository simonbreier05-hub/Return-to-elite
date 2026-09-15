import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { RoomTaskType } from "@/lib/domain";

const INCLUDE = {
  room: { select: { id: true, number: true, floor: true } },
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

/**
 * Create a RoomTask (houseman furniture/bed job) and route it to the
 * houseman's queue — the audit entry and realtime/notification broadcasts
 * that go with it, pulled out of the route the same way reportDefect() is
 * pulled out of POST /api/rooms/[id]/defects, so the create-and-notify
 * behaviour has one place to test.
 */
export async function createRoomTask(input: {
  room: { id: string; number: string };
  type: RoomTaskType;
  note: string | null;
  createdById: string;
}) {
  const { room, type, note, createdById } = input;

  const roomTask = await prisma.roomTask.create({
    data: { roomId: room.id, type, note, createdById },
    include: INCLUDE,
  });

  await audit({
    action: "ROOM_TASK_CREATED",
    userId: createdById,
    roomId: room.id,
    meta: { roomTaskId: roomTask.id, type, note },
  });

  const notification = await prisma.notification.create({
    data: {
      type: "ROOM_TASK",
      level: "info",
      targetRole: "houseman",
      roomId: room.id,
      message: `New task: room ${room.number} — ${type}${note ? `: ${note}` : ""}`,
      dedupeKey: `ROOM_TASK:${roomTask.id}`,
    },
  });
  broadcast("notification:new", { notification });
  broadcast("roomtask:update", { roomTask });

  return roomTask;
}
