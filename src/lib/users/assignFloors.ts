import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { serializeAssignedFloors } from "@/lib/floors";

/**
 * Persist a duty manager's floor assignment for one supervisor. Caller
 * (PATCH /api/users/[id]/floors) has already checked the target user exists
 * and is a supervisor, and that the floor numbers are valid — this is just
 * the write + notify path, modeled on createRoomTask().
 */
export async function assignFloors({
  user,
  floors,
  actorId,
}: {
  user: { id: string; name: string };
  floors: number[];
  actorId: string;
}) {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { assignedFloors: serializeAssignedFloors(floors) },
    select: { id: true, name: true, email: true, role: true, assignedFloors: true },
  });

  await audit({
    action: "SUPERVISOR_FLOORS_ASSIGNED",
    userId: actorId,
    meta: { supervisorId: user.id, floors },
  });

  broadcast("user:floors", { userId: updated.id, floors });
  return updated;
}
