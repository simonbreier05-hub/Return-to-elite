import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { hasInternalSecret } from "@/lib/internalAuth";
import { runDuePurge, runGuestDataPurge } from "@/lib/guestDataPurge";

/**
 * POST /api/internal/guest-data-purge
 * - Ticker aus server.js (Header x-internal-secret): läuft nur, wenn laut Zeitplan fällig — auch Nachholen nach einem Ausfall.
 * - Duty Manager (Sitzung): löscht sofort ("Gastdaten jetzt löschen").
 */
export async function POST(req: NextRequest) {
  if (hasInternalSecret(req)) return NextResponse.json(await runDuePurge());
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await runGuestDataPurge("MANUAL", auth.session.userId));
}
