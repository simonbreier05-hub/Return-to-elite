import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { keyed } from "@/lib/i18n/notificationText";
import { parseAssignedFloors } from "@/lib/floors";
import type { TKey } from "@/lib/i18n/translations";

/**
 * F2: Meldung an die Verantwortlichen eines Zimmers — Supervisor der Etage (gibt es keinen, alle Supervisoren) und
 * Duty Manager (sieht jede Meldung, `api/notifications`), auf Wunsch auch die heute zugeteilte Housekeeperin und das Front Office.
 * Nur Zimmer, Grund, Dauer — nie Gastdaten. `dedupeKey`: höchstens eine Meldung je Schlüssel (Ticker). Liefert die Anzahl.
 */
export async function notifyFloorLeads(opts: {
  roomId: string; type: string; level: "info" | "warning" | "critical"; message: string; key: TKey; vars?: Record<string, string | number>;
  dedupeKey?: string; housekeeper?: boolean; frontOffice?: boolean; skipUserId?: string | null; now?: Date;
}): Promise<number> {
  const room = await prisma.room.findUnique({ where: { id: opts.roomId }, select: { id: true, number: true, floor: true, assignedToId: true, assignedOn: true } });
  if (!room) return 0;
  if (opts.dedupeKey && (await prisma.notification.findFirst({ where: { dedupeKey: { startsWith: opts.dedupeKey } }, select: { id: true } }))) return 0;
  const sups = (await prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true, assignedFloors: true } }))
    .filter((u) => parseAssignedFloors(u.assignedFloors).includes(room.floor) && u.id !== opts.skipUserId);
  const targets: { targetRole: string; targetUserId: string | null }[] = sups.length
    ? sups.map((s) => ({ targetRole: "supervisor", targetUserId: s.id }))
    : [{ targetRole: "supervisor", targetUserId: null }];
  if (opts.housekeeper && room.assignedToId && room.assignedOn === berlinDate(opts.now ?? new Date()) && room.assignedToId !== opts.skipUserId) {
    targets.push({ targetRole: "room_attendant", targetUserId: room.assignedToId });
  }
  if (opts.frontOffice) targets.push({ targetRole: "front_office", targetUserId: null });
  let n = 0;
  for (const [i, t] of targets.entries()) {
    const notification = await prisma.notification.create({
      data: {
        type: opts.type, level: opts.level, ...t, roomId: room.id, message: opts.message, ...keyed(opts.key, opts.vars ?? {}),
        ...(opts.dedupeKey ? { dedupeKey: `${opts.dedupeKey}#${i}` } : {}),
      },
    });
    broadcast("notification:new", { notification });
    n++;
  }
  return n;
}
