import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { RoomStatusSchema, type BlockReason, type RoomStatus } from "@/lib/domain";
import { checkTransition } from "@/lib/stateMachine";
import { pms } from "@/lib/pms/MockPMSConnector";
import type { Session } from "@/lib/auth";

/**
 * The one place a room's status is allowed to change.
 *
 * Both the single-room endpoint and the bulk release go through here. That is
 * deliberate: the rule that only a supervisor may release a room is the core of
 * this system, and a second copy of it is a second chance to get it wrong.
 *
 * Side effects that belong to a status change — the audit entry (including for
 * refusals), the attendant's live location, the PMS push, the front-office
 * notification and the realtime broadcast — all live here too, so a bulk
 * release behaves exactly like sixteen individual ones.
 */

export interface StatusChangeInput {
  status: RoomStatus;
  blockReason?: BlockReason;
  note?: string;
  oooUntil?: Date;
}

export type StatusChangeResult =
  | { ok: true; room: Awaited<ReturnType<typeof updateRoom>> }
  | { ok: false; status: number; error: string };

function updateRoom(id: string, data: Parameters<typeof prisma.room.update>[0]["data"]) {
  return prisma.room.update({
    where: { id },
    data,
    include: { assignedTo: { select: { id: true, name: true } } },
  });
}

export async function applyStatusChange(
  session: Session,
  roomId: string,
  input: StatusChangeInput
): Promise<StatusChangeResult> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, status: 404, error: "Room not found." };

  const from = RoomStatusSchema.parse(room.status);
  const to = input.status;

  // --- State machine + RBAC. Every refusal is recorded, not just failures. ---
  const check = checkTransition(session.role, from, to);
  if (!check.ok) {
    await audit({
      action: "STATUS_CHANGE_DENIED",
      userId: session.userId,
      roomId: room.id,
      fromStatus: from,
      toStatus: to,
      meta: { reason: check.error, role: session.role },
    });
    return { ok: false, status: check.code, error: check.error };
  }

  // --- Payload each target status requires ---------------------------------
  if (to === "BLOCKED" && !input.blockReason) {
    return {
      ok: false,
      status: 400,
      error: "BLOCKED requires a reason (DND | GUEST_IN_ROOM | DOUBLE_LOCKED | REFUSED).",
    };
  }
  if (to === "PICKUP" && !input.note?.trim()) {
    return { ok: false, status: 400, error: "PICKUP (rework) requires a note for the attendant." };
  }
  if (to === "OUT_OF_ORDER" && !input.oooUntil) {
    return { ok: false, status: 400, error: "OUT_OF_ORDER requires an end time (oooUntil)." };
  }

  const now = new Date();
  const updated = await updateRoom(room.id, {
    status: to,
    statusSince: now,
    blockReason: to === "BLOCKED" ? input.blockReason : null,
    blockedSince: to === "BLOCKED" ? now : null,
    reworkNote: to === "PICKUP" ? input.note : to === "IN_PROGRESS" ? room.reworkNote : null,
    oooUntil: to === "OUT_OF_ORDER" ? input.oooUntil : null,
    // Released means today's backlog on this room is over — a plan applied
    // later today can still defer it again if it comes back into play.
    deferredSince: to === "INSPECTED" ? null : undefined,
  });

  await audit({
    action: "STATUS_CHANGE",
    userId: session.userId,
    roomId: room.id,
    fromStatus: from,
    toStatus: to,
    meta: { blockReason: input.blockReason, note: input.note, oooUntil: input.oooUntil, role: session.role },
  });

  // Starting a room records where the attendant is.
  if (to === "IN_PROGRESS" && session.role === "room_attendant") {
    await prisma.user.update({
      where: { id: session.userId },
      data: { currentRoomId: room.id, lastSeenAt: now },
    });
    broadcast("attendant:location", {
      userId: session.userId,
      name: session.name,
      roomId: room.id,
      roomNumber: room.number,
    });
  }

  if (to === "INSPECTED") {
    // Business rule: INSPECTED is the only status the PMS ever hears about.
    await pms.pushRoomStatus(room.number, "INSPECTED");

    const waiting = await prisma.arrival.findMany({
      where: { roomId: room.id, status: "EXPECTED", notifyOnRelease: true },
    });
    for (const arrival of waiting) {
      const notification = await prisma.notification.create({
        data: {
          type: "ROOM_RELEASED",
          level: "info",
          targetRole: "front_office",
          roomId: room.id,
          message: `Room ${room.number} released (INSPECTED) — ready for ${arrival.guestName}${
            arrival.vip ? " (VIP)" : ""
          }.`,
          dedupeKey: `ROOM_RELEASED:${arrival.id}:${now.getTime()}`,
        },
      });
      broadcast("notification:new", { notification });
    }
  }

  broadcast("room:update", { room: updated });
  broadcast("room:status", { roomId: room.id, number: room.number, from, to, by: session.name });

  return { ok: true, room: updated };
}
