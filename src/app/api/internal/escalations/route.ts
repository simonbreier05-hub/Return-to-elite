import { NextRequest, NextResponse } from "next/server";
import { runEscalations } from "@/lib/escalations";
import { requireRole } from "@/lib/rbac";

/**
 * POST /api/internal/escalations — executed every 60s by the ticker in
 * server.js (same host, marked with x-internal-ticker). A duty_manager may
 * also trigger it manually.
 */
export async function POST(req: NextRequest) {
  const isTicker = req.headers.get("x-internal-ticker") === "1";
  if (!isTicker) {
    const auth = await requireRole(["duty_manager"]);
    if (!auth.ok) return auth.response;
  }
  const result = await runEscalations();
  return NextResponse.json(result);
}
