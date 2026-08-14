import { prisma } from "./db";

/**
 * Audit trail — every status change (successful OR denied), login, PMS push
 * and escalation lands here. Queryable via /api/audit (duty_manager).
 */
export async function audit(entry: {
  action: string;
  userId?: string | null;
  roomId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  meta?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      action: entry.action,
      userId: entry.userId ?? null,
      roomId: entry.roomId ?? null,
      fromStatus: entry.fromStatus ?? null,
      toStatus: entry.toStatus ?? null,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
    },
  });
}
