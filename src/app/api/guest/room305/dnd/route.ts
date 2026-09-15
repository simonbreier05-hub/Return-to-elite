import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { DND_WINDOWS, DND_WINDOW_LABELS } from "@/lib/guest";
import { getGuestRoom } from "@/lib/guestServer";

/**
 * TEST/DEMO — unauthenticated guest-facing "Do Not Disturb" request, hard
 * scoped to room 305 (see src/app/guest/305). Real guests will reach this
 * kind of action via an NFC tag / pre-arrival link, not a public route —
 * remove once that exists.
 *
 * This does NOT set Room.status/blockReason directly: that transition is
 * gated to staff sessions by the state machine (src/lib/stateMachine.ts),
 * and attributing it to a fake staff identity would be worse than not
 * automating it. Instead it raises the same Notification staff already
 * watch for everything else (see src/app/api/rooms/[id]/defects/route.ts).
 */

const Body = z.object({ window: z.enum(DND_WINDOWS) });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid time window." }, { status: 400 });

  const room = await getGuestRoom();
  if (!room) return NextResponse.json({ error: "Room 305 not found — is the database seeded?" }, { status: 404 });

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
