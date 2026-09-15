import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { Session } from "@/lib/auth";

/**
 * Moves one room from its current attendant to another, keeping both
 * attendants' Laufplan (routeOrder) tidy: the moved room is appended to the
 * end of the target's route, and the source's remaining rooms are
 * re-sequenced (0..n-1) to close the gap it left behind.
 *
 * Used by the supervisor's housekeeper roster ("Verschieben zu…") when one
 * attendant is faster than another. Distinct from /api/rooms/[id]/assign,
 * which sets assignedToId alone (e.g. assigning an unassigned room) and does
 * not touch routeOrder — this is specifically for moving a room that is
 * already mid-route between two people without scrambling either route.
 */

function updateRoom(id: string, data: Parameters<typeof prisma.room.update>[0]["data"]) {
  return prisma.room.update({
    where: { id },
    data,
    include: { assignedTo: { select: { id: true, name: true } } },
  });
}

export type MoveRoomResult =
  | { ok: true; room: Awaited<ReturnType<typeof updateRoom>> }
  | { ok: false; status: number; error: string };

export async function moveRoomBetweenAttendants(
  session: Session,
  roomId: string,
  toAttendantId: string
): Promise<MoveRoomResult> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, status: 404, error: "Room not found." };
  if (!room.assignedToId) {
    return { ok: false, status: 409, error: "Room is not currently assigned to anyone — use assign instead." };
  }
  if (room.assignedToId === toAttendantId) {
    return { ok: false, status: 409, error: "Room is already assigned to this attendant." };
  }

  const toAttendant = await prisma.user.findUnique({ where: { id: toAttendantId } });
  if (!toAttendant || toAttendant.role !== "room_attendant") {
    return { ok: false, status: 400, error: "toAttendantId must reference a room attendant." };
  }

  const fromAttendantId = room.assignedToId;

  const [targetRooms, sourceSiblings] = await Promise.all([
    prisma.room.findMany({ where: { assignedToId: toAttendantId }, orderBy: { routeOrder: "asc" } }),
    prisma.room.findMany({ where: { assignedToId: fromAttendantId, id: { not: roomId } }, orderBy: { routeOrder: "asc" } }),
  ]);
  const nextRouteOrder = targetRooms.reduce((max, r) => Math.max(max, r.routeOrder ?? -1), -1) + 1;

  const [updated] = await prisma.$transaction([
    updateRoom(roomId, { assignedToId: toAttendantId, routeOrder: nextRouteOrder }),
    ...sourceSiblings.map((r, index) => prisma.room.update({ where: { id: r.id }, data: { routeOrder: index } })),
  ]);

  await audit({
    action: "ROOM_MOVED",
    userId: session.userId,
    roomId,
    meta: { fromAttendantId, toAttendantId },
  });

  broadcast("room:update", { room: updated });
  broadcast("route:reordered", { attendantId: fromAttendantId, roomIds: sourceSiblings.map((r) => r.id) });
  broadcast("route:reordered", { attendantId: toAttendantId, roomIds: [...targetRooms.map((r) => r.id), roomId] });

  return { ok: true, room: updated };
}
