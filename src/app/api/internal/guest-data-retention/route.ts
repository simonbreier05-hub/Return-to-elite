import { NextRequest, NextResponse } from "next/server";
import { runGuestDataRetention } from "@/lib/guestDataRetention";
import { requireRole } from "@/lib/rbac";
import { purgeExpiredChat } from "@/lib/chat/retention";

/**
 * POST /api/internal/guest-data-retention — executed roughly hourly by the
 * ticker in server.js (same host, marked with x-internal-ticker). A
 * duty_manager may also trigger it manually.
 */
export async function POST(req: NextRequest) {
  const isTicker = req.headers.get("x-internal-ticker") === "1";
  if (!isTicker) {
    const auth = await requireRole(["duty_manager"]);
    if (!auth.ok) return auth.response;
  }
  const result = await runGuestDataRetention();
  // Chat-Aufbewahrung im selben stündlichen Lauf (src/lib/chat/retention.ts).
  const chat = await purgeExpiredChat();
  return NextResponse.json({ ...result, ...chat });
}
