import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { parseAssignedFloors } from "@/lib/floors";
import { keyed } from "@/lib/i18n/notificationText";

/**
 * Hausmann-Aufgabe erledigt (oder wieder geöffnet): die zuständigen Supervisoren (Etage des Zimmers) werden gemeldet;
 * der Duty Manager sieht ohnehin alle Meldungen (und die Live-Einsicht). Nur Zimmer + Etage — nie Aufgabentext, nie Gastdaten.
 */
export async function notifyTaskDone(opts: { room: { id: string; number: string; floor: number }; actorId: string; done: boolean }): Promise<number> {
  const { room, actorId, done } = opts;
  const sups = await prisma.user.findMany({ where: { role: "supervisor", id: { not: actorId } }, select: { id: true, assignedFloors: true } });
  let n = 0;
  for (const s of sups) {
    if (!parseAssignedFloors(s.assignedFloors).includes(room.floor)) continue;
    const notification = await prisma.notification.create({ data: {
      type: done ? "HOUSEMAN_TASK_DONE" : "HOUSEMAN_TASK_REOPENED", level: "info", targetRole: "supervisor", targetUserId: s.id, roomId: room.id,
      message: `Zimmer ${room.number} (Etage ${room.floor}): Hausmann-Aufgabe ${done ? "erledigt" : "wieder geöffnet"}.`,
      ...keyed(done ? "notify.houseTaskDone" : "notify.houseTaskReopened", { n: room.number, floor: room.floor }),
    } });
    broadcast("notification:new", { notification });
    n++;
  }
  return n;
}
