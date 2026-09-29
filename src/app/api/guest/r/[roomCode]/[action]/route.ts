import { NextRequest, NextResponse } from "next/server";
import { resolveGuestAccessByRoomCode } from "@/lib/guestServer";
import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { isGuestAction, runGuestAction } from "@/lib/guestActions";

/**
 * NFC/QR write action for one room (Prompt G2 Teil 2), e.g.
 * POST /api/guest/r/<roomCode>/dnd. Never distinguishes "unknown code"
 * from "no current stay" — both are a plain 404, same as
 * src/app/g/r/[roomCode]/page.tsx's page-level resolution.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string; action: string }> }) {
  const { roomCode, action } = await params;
  if (!isGuestAction(action)) return NextResponse.json({ error: "Unknown action." }, { status: 404 });

  const access = await resolveGuestAccessByRoomCode(roomCode);
  if (!access) return NextResponse.json({ error: "Not available." }, { status: 404 });

  const rateLimit = await checkGuestRateLimit(access.room.id, getClientIp(req));
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests — please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  return runGuestAction(action, access.room, req);
}
