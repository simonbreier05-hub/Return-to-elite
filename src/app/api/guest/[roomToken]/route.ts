import { NextRequest, NextResponse } from "next/server";
import { guardGuestRequest } from "@/lib/rooms/resolveGuestRoom";

/**
 * GET /api/guest/[roomToken] — minimal room info for the landing page.
 * No login, no session: possession of the token is the only authorization.
 * Only the fields the guest screen needs to render its header are returned —
 * never anything about other rooms or staff.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const gate = await guardGuestRequest(req, roomToken, "info", { limit: 20, windowMs: 60_000 });
  if (!gate.ok) return gate.response;

  return NextResponse.json({ roomNumber: gate.room.number, floor: gate.room.floor });
}
