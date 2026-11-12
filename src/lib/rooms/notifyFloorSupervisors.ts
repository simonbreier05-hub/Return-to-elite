import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { parseAssignedFloors } from "@/lib/floors";
import type { keyed } from "@/lib/i18n/notificationText";

/**
 * Meldung an die Supervisoren, die für die Etage des Zimmers zuständig sind (`User.assignedFloors`) — gezielt per
 * `targetUserId`. Ist niemand für die Etage eingeteilt, geht sie an die Rolle Supervisor (ohne Person), damit sie nicht
 * verloren geht. Wer die Änderung selbst ausgelöst hat, wird nicht gemeldet. Nur Zimmer/Etage — nie Gastdaten.
 * Fehler werden geschluckt: eine Meldung darf die eigentliche Aktion nie scheitern lassen.
 */
export async function notifyFloorSupervisors(opts: {
  room: { id: string; number: string; floor: number };
  actorId?: string | null;
  type: string;
  level?: "info" | "warning" | "critical";
  message: string;
  k: ReturnType<typeof keyed>;
}): Promise<number> {
  try {
    const sups = await prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true, assignedFloors: true } });
    const onFloor = sups.filter((s) => parseAssignedFloors(s.assignedFloors).includes(opts.room.floor));
    const targets: (string | null)[] = onFloor.length ? onFloor.map((s) => s.id).filter((id) => id !== opts.actorId) : [null];
    for (const targetUserId of targets) {
      const notification = await prisma.notification.create({
        data: { type: opts.type, level: opts.level ?? "info", targetRole: "supervisor", targetUserId, roomId: opts.room.id, message: opts.message, ...opts.k },
      });
      broadcast("notification:new", { notification });
    }
    return targets.length;
  } catch {
    return 0;
  }
}
