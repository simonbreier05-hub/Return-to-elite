import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { BlockReasonSchema, RoomStatusSchema } from "@/lib/domain";
import { checkTransition } from "@/lib/stateMachine";
import { pms } from "@/lib/pms/MockPMSConnector";

/**
 * POST /api/rooms/[id]/status — THE core endpoint.
 *
 * Enforces, server-side and audit-logged:
 *  - authentication + role permission matrix (only supervisor/duty_manager
 *    may set INSPECTED → anything else gets 403, logged as
 *    STATUS_CHANGE_DENIED)
 *  - legal state-machine transitions (409 otherwise)
 *  - required payload per target status (BLOCKED reason, PICKUP note, OOO end)
 *  - side effects: attendant live location, PMS push (INSPECTED only),
 *    front-office release notification, realtime broadcast.
 */

const BodySchema = z.object({
  status: RoomStatusSchema,
  blockReason: BlockReasonSchema.optional(),
  note: z.string().max(1000).optional(),
  oooUntil: z.coerce.date().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { session } = auth;
  const { id } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { status: to, blockReason, note, oooUntil } = parsed.data;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const from = RoomStatusSchema.parse(room.status);

  // --- State machine + RBAC (audit every denied attempt) ------------------
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
    return NextResponse.json({ error: check.error }, { status: check.code });
  }

  // --- Per-status payload requirements ------------------------------------
  if (to === "BLOCKED" && !blockReason) {
    return NextResponse.json({ error: "BLOCKED requires a reason (DND | GUEST_IN_ROOM | DOUBLE_LOCKED | REFUSED)." }, { status: 400 });
  }
  if (to === "PICKUP" && !note?.trim()) {
    return NextResponse.json({ error: "PICKUP (rework) requires a note for the attendant." }, { status: 400 });
  }
  if (to === "OUT_OF_ORDER" && !oooUntil) {
    return NextResponse.json({ error: "OUT_OF_ORDER requires an end time (oooUntil)." }, { status: 400 });
  }

  // --- Apply ---------------------------------------------------------------
  const now = new Date();
  const updated = await prisma.room.update({
    where: { id: room.id },
    data: {
      status: to,
      statusSince: now,
      blockReason: to === "BLOCKED" ? blockReason : null,
      blockedSince: to === "BLOCKED" ? now : null,
      reworkNote: to === "PICKUP" ? note : to === "IN_PROGRESS" ? room.reworkNote : null,
      oooUntil: to === "OUT_OF_ORDER" ? oooUntil : null,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  await audit({
    action: "STATUS_CHANGE",
    userId: session.userId,
    roomId: room.id,
    fromStatus: from,
    toStatus: to,
    meta: { blockReason, note, oooUntil, role: session.role },
  });

  // Attendant live location: starting a room records "I am here".
  if (to === "IN_PROGRESS" && session.role === "room_attendant") {
    await prisma.user.update({
      where: { id: session.userId },
      data: { currentRoomId: room.id, lastSeenAt: now },
    });
    broadcast("attendant:location", { userId: session.userId, name: session.name, roomId: room.id, roomNumber: room.number });
  }

  if (to === "INSPECTED") {
    // ONLY INSPECTED is pushed to the PMS as sellable (business rule).
    await pms.pushRoomStatus(room.number, "INSPECTED");

    // Notify front office when a requested room is released.
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
          message: `Room ${room.number} released (INSPECTED) — ready for ${arrival.guestName}${arrival.vip ? " (VIP)" : ""}.`,
          dedupeKey: `ROOM_RELEASED:${arrival.id}:${now.getTime()}`,
        },
      });
      broadcast("notification:new", { notification });
    }
  }

  broadcast("room:update", { room: updated });
  broadcast("room:status", { roomId: room.id, number: room.number, from, to, by: session.name });

  return NextResponse.json({ room: updated });
}
