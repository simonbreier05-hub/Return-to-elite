import { NextResponse } from "next/server";
import { resolveGuestAccessByRoomCode } from "@/lib/guestServer";
import { getGuestStatusFeed } from "@/lib/guestStatusFeed";

/**
 * GET /api/guest/r/<roomCode>/status — the guest's own requests for this
 * room, polled by the guest screen (Prompt G2 Teil 3: "Live-Aktualisierung").
 * Not a Socket.IO push: that channel broadcasts full staff payloads
 * (housekeeper names, other rooms' notes) to every connected client
 * unauthenticated, so putting a guest browser on it would leak exactly the
 * data Teil 2's Datenschutz section forbids. Polling this narrow, already
 * access-checked endpoint stays inside the same trust boundary as every
 * other guest action.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const access = await resolveGuestAccessByRoomCode(roomCode);
  if (!access) return NextResponse.json({ error: "Not available." }, { status: 404 });

  return NextResponse.json(await getGuestStatusFeed(access.room.id));
}
