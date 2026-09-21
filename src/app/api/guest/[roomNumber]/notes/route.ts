import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addRoomNote } from "@/lib/rooms/addRoomNote";
import { getGuestRoom, getGuestSystemUserId } from "@/lib/guestServer";

/**
 * Unauthenticated guest-facing message to housekeeping for one room (see
 * src/app/guest/[roomNumber]). Reuses the exact same addRoomNote() logic as
 * the staff route (src/app/api/rooms/[id]/notes/route.ts), so the message
 * shows up in the Supervisor/Attendant note lists exactly like any other
 * room note.
 */

const Body = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomNumber: string }> }) {
  const { roomNumber } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message required." }, { status: 400 });

  const room = await getGuestRoom(roomNumber);
  if (!room) return NextResponse.json({ error: `Room ${roomNumber} not found.` }, { status: 404 });

  const authorId = await getGuestSystemUserId();
  const note = await addRoomNote({ room, authorId, body: parsed.data.body });

  return NextResponse.json({ note }, { status: 201 });
}
