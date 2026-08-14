import { prisma } from "./db";
import { broadcast } from "./realtime";
import { getSettings } from "./settings";
import type { Role } from "./domain";

/**
 * Escalation engine — executed every minute by the ticker in server.js
 * (via POST /api/internal/escalations). Emits Notification rows + socket
 * events, deduplicated per (type, room, escalation stage) via dedupeKey.
 *
 * Rules (thresholds configurable in the Setting table):
 *  - BLOCKED_RECHECK: room BLOCKED/DND longer than blockedRecheckMinutes
 *  - WELFARE_CHECK:  DND older than welfareCheckMinutes → welfare check
 *  - ETA_AT_RISK:    arrival ETA within etaWarningMinutes, room not INSPECTED
 *  - RELEASE_QUEUE_BACKLOG: too many CLEAN rooms waiting for inspection
 */

async function notifyOnce(entry: {
  type: string;
  level: "info" | "warning" | "critical";
  targetRole: Role;
  roomId?: string | null;
  message: string;
  dedupeKey: string;
}) {
  const existing = await prisma.notification.findFirst({ where: { dedupeKey: entry.dedupeKey } });
  if (existing) return null;
  const notification = await prisma.notification.create({ data: entry });
  broadcast("notification:new", { notification });
  return notification;
}

export async function runEscalations(now = new Date()) {
  const settings = await getSettings();
  const created: string[] = [];

  // --- BLOCKED rooms: re-check + welfare check --------------------------
  const blocked = await prisma.room.findMany({ where: { status: "BLOCKED" } });
  for (const room of blocked) {
    if (!room.blockedSince) continue;
    const ageMin = (now.getTime() - room.blockedSince.getTime()) / 60_000;
    const stamp = room.blockedSince.getTime();

    if (ageMin >= settings.blockedRecheckMinutes) {
      const stage = Math.floor(ageMin / settings.blockedRecheckMinutes);
      const n = await notifyOnce({
        type: "BLOCKED_RECHECK",
        level: "warning",
        targetRole: "room_attendant",
        roomId: room.id,
        message: `Room ${room.number}: ${room.blockReason ?? "BLOCKED"} for ${Math.round(ageMin)} min — please re-check.`,
        dedupeKey: `BLOCKED_RECHECK:${room.id}:${stamp}:${stage}`,
      });
      if (n) created.push(n.type);
    }

    if (room.blockReason === "DND" && ageMin >= settings.welfareCheckMinutes) {
      const n = await notifyOnce({
        type: "WELFARE_CHECK",
        level: "critical",
        targetRole: "duty_manager",
        roomId: room.id,
        message: `Room ${room.number}: DND for ${Math.round(ageMin)} min — welfare check recommended.`,
        dedupeKey: `WELFARE_CHECK:${room.id}:${stamp}`,
      });
      if (n) created.push(n.type);
    }
  }

  // --- Arrivals at risk --------------------------------------------------
  const horizon = new Date(now.getTime() + settings.etaWarningMinutes * 60_000);
  const arrivals = await prisma.arrival.findMany({
    where: { status: "EXPECTED", eta: { lte: horizon } },
    include: { room: true },
  });
  for (const arrival of arrivals) {
    if (arrival.room.status === "INSPECTED") continue;
    const minutes = arrival.eta ? Math.round((arrival.eta.getTime() - now.getTime()) / 60_000) : 0;
    const n = await notifyOnce({
      type: "ETA_AT_RISK",
      level: minutes <= 0 ? "critical" : "warning",
      targetRole: "supervisor",
      roomId: arrival.roomId,
      message: `Room ${arrival.room.number}: ${arrival.guestName}${arrival.vip ? " (VIP)" : ""} ETA ${
        minutes <= 0 ? "passed" : `in ${minutes} min`
      } but room is ${arrival.room.status}, not INSPECTED.`,
      dedupeKey: `ETA_AT_RISK:${arrival.id}`,
    });
    if (n) created.push(n.type);
  }

  // --- Release queue backlog --------------------------------------------
  const cleanCount = await prisma.room.count({ where: { status: "CLEAN" } });
  if (cleanCount >= settings.releaseQueueBacklogThreshold) {
    const bucket = Math.floor(now.getTime() / (30 * 60_000)); // at most every 30 min
    const n = await notifyOnce({
      type: "RELEASE_QUEUE_BACKLOG",
      level: "warning",
      targetRole: "supervisor",
      message: `${cleanCount} rooms are CLEAN and waiting for inspection — release queue backlog.`,
      dedupeKey: `RELEASE_QUEUE_BACKLOG:${bucket}`,
    });
    if (n) created.push(n.type);
  }

  return { created: created.length };
}
