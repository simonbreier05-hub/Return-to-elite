import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { serializeAssignedFloors } from "@/lib/floors";
import { keyed } from "@/lib/i18n/notificationText";

/**
 * Persist a floor assignment for one supervisor. Caller
 * (Tagesplanung: saveFloors in src/lib/planung/teamData.ts) has already checked the target user exists
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
  // Der Supervisor erfährt, dass sich seine Liste (Etagen) geändert hat — außer er hat es selbst getan.
  if (updated.id !== actorId) {
    const notification = await prisma.notification.create({ data: { type: "FLOORS_ASSIGNED", level: "info", targetRole: "supervisor", targetUserId: updated.id,
      message: floors.length ? `Deine Etagen wurden geändert: Etage ${floors.join(", ")}.` : "Dir sind keine Etagen mehr zugeteilt.",
      ...(floors.length ? keyed("notify.floorsChanged", { floors: floors.join(", ") }) : keyed("notify.floorsNone")) } });
    broadcast("notification:new", { notification });
  }
  return updated;
}
