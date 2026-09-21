import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { CONTACT_DEPARTMENTS } from "@/lib/guest";
import { getGuestRoom } from "@/lib/guestServer";

/**
 * Unauthenticated guest-facing "contact a department" request for one room
 * (see src/app/guest/[roomNumber] and the note in ../dnd/route.ts on why
 * this raises a Notification rather than touching Room.status directly).
 */

const Body = z.object({ department: z.string() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomNumber: string }> }) {
  const { roomNumber } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Department required." }, { status: 400 });

  const dept = CONTACT_DEPARTMENTS.find((d) => d.key === parsed.data.department);
  if (!dept) return NextResponse.json({ error: "Unknown department." }, { status: 400 });

  const room = await getGuestRoom(roomNumber);
  if (!room) return NextResponse.json({ error: `Room ${roomNumber} not found.` }, { status: 404 });

  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_REQUEST",
      level: "info",
      targetRole: dept.role,
      roomId: room.id,
      message: `Room ${room.number}: guest wants to be contacted by ${dept.label}.`,
    },
  });
  broadcast("notification:new", { notification });

  return NextResponse.json({ ok: true }, { status: 201 });
}
