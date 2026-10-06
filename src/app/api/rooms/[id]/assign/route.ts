import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { notifyReassignment } from "@/lib/rooms/notifyReassignment";

/** POST /api/rooms/[id]/assign — supervisor assigns/unassigns an attendant. */
const Body = z.object({ attendantId: z.string().nullable() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "attendantId required (or null)." }, { status: 400 });

  if (parsed.data.attendantId) {
    const attendant = await prisma.user.findUnique({ where: { id: parsed.data.attendantId } });
    if (!attendant || attendant.role !== "room_attendant") {
      return NextResponse.json({ error: "attendantId must reference a room attendant." }, { status: 400 });
    }
  }

  const before = await prisma.room.findUnique({ where: { id }, select: { assignedToId: true } });
  const room = await prisma.room.update({
    where: { id },
    data: { assignedToId: parsed.data.attendantId, assignedOn: parsed.data.attendantId ? berlinDate(new Date()) : null },
    include: { assignedTo: { select: { id: true, name: true, dailyNumber: true } } },
  });
  await audit({
    action: "ROOM_ASSIGNED",
    userId: auth.session.userId,
    roomId: id,
    meta: { attendantId: parsed.data.attendantId },
  });
  await notifyReassignment({ room: { id: room.id, number: room.number, floor: room.floor }, fromId: before?.assignedToId ?? null, toId: parsed.data.attendantId, actorId: auth.session.userId });
  broadcast("room:update", { room });
  return NextResponse.json({ room });
}
