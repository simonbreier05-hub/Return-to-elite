import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * PATCH /api/rooms/reorder — persist a drag-reordered running order
 * ("Laufplan") for one attendant's rooms.
 *
 * An attendant may only reorder their own rooms — this is a personal
 * walking-order preference, not a reassignment, so no elevated role is
 * needed. A supervisor/duty_manager may reorder on behalf of any attendant
 * (e.g. adjusting the plan before or after applying it).
 *
 * The full new sequence is sent every time (small lists, simple contract);
 * every id must already belong to the target attendant, otherwise nothing
 * is written — a stale client should not silently scramble someone else's
 * assignment.
 */
const Body = z.object({
  roomIds: z.array(z.string().min(1)).min(1).max(50),
  attendantId: z.string().min(1).optional(), // supervisor/duty_manager only; defaults to self
});

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { roomIds, attendantId } = parsed.data;

  const canActForOthers = auth.session.role === "supervisor" || auth.session.role === "duty_manager";
  const targetAttendantId = attendantId ?? auth.session.userId;
  if (attendantId && attendantId !== auth.session.userId && !canActForOthers) {
    return NextResponse.json({ error: "Forbidden: cannot reorder another attendant's rooms." }, { status: 403 });
  }

  const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } } });
  if (rooms.length !== roomIds.length || rooms.some((r) => r.assignedToId !== targetAttendantId)) {
    return NextResponse.json(
      { error: "Every room must currently be assigned to the target attendant." },
      { status: 409 }
    );
  }

  await prisma.$transaction(
    roomIds.map((id, index) => prisma.room.update({ where: { id }, data: { routeOrder: index } }))
  );

  await audit({
    action: "ROUTE_REORDERED",
    userId: auth.session.userId,
    meta: { attendantId: targetAttendantId, roomCount: roomIds.length },
  });

  broadcast("route:reordered", { attendantId: targetAttendantId, roomIds });

  return NextResponse.json({ ok: true });
}
