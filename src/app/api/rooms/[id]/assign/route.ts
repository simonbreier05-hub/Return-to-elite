import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

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

  const room = await prisma.room.update({
    where: { id },
    data: { assignedToId: parsed.data.attendantId },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  await audit({
    action: "ROOM_ASSIGNED",
    userId: auth.session.userId,
    roomId: id,
    meta: { attendantId: parsed.data.attendantId },
  });
  broadcast("room:update", { room });
  return NextResponse.json({ room });
}
