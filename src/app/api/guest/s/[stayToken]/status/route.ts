import { NextResponse } from "next/server";
import { resolveGuestAccessByStayToken } from "@/lib/guestServer";
import { getGuestStatusFeed } from "@/lib/guestStatusFeed";

/**
 * GET /api/guest/s/<stayToken>/status — same as
 * src/app/api/guest/r/[roomCode]/status/route.ts, for the pre-arrival-link
 * access path. See that file for why this polls instead of subscribing to
 * the staff Socket.IO broadcast.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ stayToken: string }> }) {
  const { stayToken } = await params;
  const access = await resolveGuestAccessByStayToken(stayToken);
  if (!access) return NextResponse.json({ error: "Not available." }, { status: 404 });

  return NextResponse.json(await getGuestStatusFeed(access.room.id));
}
