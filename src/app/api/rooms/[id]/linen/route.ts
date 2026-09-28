import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * POST /api/rooms/[id]/linen — supervisor/duty_manager confirms the towels
 * and bed linen were actually changed today, stamping Room.lastLinenChangeAt
 * so src/lib/rooms/laundryDue.ts stops flagging it until the next cycle.
 * Deliberately a separate, tiny endpoint rather than folded into the status
 * route: it's a fact about laundry, not a room-status transition, and can
 * be recorded on any stayover regardless of what status it's currently in.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const room = await prisma.room.update({
    where: { id },
    data: { lastLinenChangeAt: new Date() },
  });
  await audit({ action: "LINEN_CHANGED", userId: auth.session.userId, roomId: id });
  broadcast("room:update", { room });
  return NextResponse.json({ room });
}
