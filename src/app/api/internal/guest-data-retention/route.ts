import { NextRequest, NextResponse } from "next/server";
import { runGuestDataRetention } from "@/lib/guestDataRetention";
import { requireRole } from "@/lib/rbac";
import { purgeExpiredChat } from "@/lib/chat/retention";
import { simulationAllowed } from "@/lib/clock";

/**
 * POST /api/internal/guest-data-retention — executed roughly hourly by the
 * ticker in server.js (same host, marked with x-internal-ticker). A
 * duty_manager may also trigger it manually.
 * S0: im Simulationsmodus (nur Preview) läuft der stündliche Ticker nicht (Fristen nach Sim-Zeit würden Testdaten löschen).
 */
export async function POST(req: NextRequest) {
  const isTicker = req.headers.get("x-internal-ticker") === "1";
  if (isTicker && simulationAllowed()) return NextResponse.json({ skipped: "simulation" });
  if (!isTicker) {
    const auth = await requireRole(["duty_manager"]);
    if (!auth.ok) return auth.response;
  }
  const result = await runGuestDataRetention();
  // Chat-Aufbewahrung im selben stündlichen Lauf (src/lib/chat/retention.ts).
  const chat = await purgeExpiredChat();
  return NextResponse.json({ ...result, ...chat });
}
