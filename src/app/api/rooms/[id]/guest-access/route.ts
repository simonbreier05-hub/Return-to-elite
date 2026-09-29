import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { regenerateRoomAccessCode } from "@/lib/guestRoomCode";
import { audit } from "@/lib/audit";

/**
 * POST /api/rooms/[id]/guest-access — regenerate one room's NFC/QR access
 * code (Prompt G2 Teil 2: "Code je Zimmer neu erzeugbar, falls ein Tag
 * verloren geht"). The old code stops resolving the instant this returns —
 * whatever was printed/programmed on the lost tag is now dead.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const room = await prisma.room.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const code = await regenerateRoomAccessCode(room.id);
  await audit({ action: "GUEST_ACCESS_CODE_REGENERATED", userId: auth.session.userId, roomId: room.id, meta: { roomNumber: room.number } });

  return NextResponse.json({ code });
}
