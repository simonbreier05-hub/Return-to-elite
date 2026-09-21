import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { CLEAN_TIMINGS, CLEAN_TIMING_LABELS } from "@/lib/guest";
import { getGuestRoom } from "@/lib/guestServer";

/**
 * Unauthenticated guest-facing "clean now" request for one room (see
 * src/app/guest/[roomNumber] and the note in ../dnd/route.ts on why this
 * raises a Notification rather than touching Room.status directly).
 */

const Body = z.object({
  timing: z.enum(CLEAN_TIMINGS),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM.")
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomNumber: string }> }) {
  const { roomNumber } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid timing." }, { status: 400 });

  const room = await getGuestRoom(roomNumber);
  if (!room) return NextResponse.json({ error: `Room ${roomNumber} not found.` }, { status: 404 });

  const { timing, time } = parsed.data;
  const timingLabel =
    timing === "LATER" && time ? `${CLEAN_TIMING_LABELS.LATER} – ${time} Uhr` : CLEAN_TIMING_LABELS[timing];

  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_REQUEST",
      level: "info",
      targetRole: "supervisor",
      roomId: room.id,
      message: `Room ${room.number}: guest requests cleaning — ${timingLabel}.`,
    },
  });
  broadcast("notification:new", { notification });

  return NextResponse.json({ ok: true }, { status: 201 });
}
