import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { DND_WINDOWS, DND_WINDOW_LABELS } from "@/lib/guest";
import { getGuestRoom } from "@/lib/guestServer";

/**
 * Unauthenticated guest-facing "Do Not Disturb" request for one room
 * (src/app/guest/[roomNumber]). Real guests reach this via an NFC tag /
 * pre-arrival link pointing straight at their room's URL.
 *
 * This does NOT set Room.status/blockReason directly: that transition is
 * gated to staff sessions by the state machine (src/lib/stateMachine.ts),
 * and attributing it to a fake staff identity would be worse than not
 * automating it. Instead it raises the same Notification staff already
 * watch for everything else (see src/app/api/rooms/[id]/defects/route.ts).
 */

const Body = z.object({ window: z.enum(DND_WINDOWS) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomNumber: string }> }) {
  const { roomNumber } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid time window." }, { status: 400 });

  const room = await getGuestRoom(roomNumber);
  if (!room) return NextResponse.json({ error: `Room ${roomNumber} not found.` }, { status: 404 });

  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_REQUEST",
      level: "info",
      targetRole: "supervisor",
      roomId: room.id,
      message: `Room ${room.number}: guest requests Do Not Disturb — ${DND_WINDOW_LABELS[parsed.data.window]}.`,
    },
  });
  broadcast("notification:new", { notification });

  return NextResponse.json({ ok: true }, { status: 201 });
}
