import { NextRequest, NextResponse } from "next/server";
import { resolveGuestAccessByStayToken } from "@/lib/guestServer";
import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { isGuestAction, runGuestAction } from "@/lib/guestActions";

/**
 * Pre-arrival-link write action for one stay (Prompt G2 Teil 2), e.g.
 * POST /api/guest/s/<stayToken>/dnd. Never distinguishes "unknown token"
 * from "expired"/"cancelled" — all a plain 404, same as
 * src/app/g/s/[stayToken]/page.tsx's page-level resolution.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ stayToken: string; action: string }> }) {
  const { stayToken, action } = await params;
  if (!isGuestAction(action)) return NextResponse.json({ error: "Unknown action." }, { status: 404 });

  const access = await resolveGuestAccessByStayToken(stayToken);
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
