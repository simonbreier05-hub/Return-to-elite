import { NextRequest, NextResponse } from "next/server";
import { hasInternalSecret } from "@/lib/internalAuth";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";
import { checkRedistribution } from "@/lib/autoplan/service";

/** POST /api/internal/redistribution-check — Prüfung alle 10 Minuten (Ticker in server.js) oder manuell durch den Supervisor. */
export async function POST(req: NextRequest) {
  if (!hasInternalSecret(req)) {
    const auth = await requireRole(["supervisor"]);
    if (!auth.ok) return auth.response;
  }
  return NextResponse.json(await checkRedistribution(berlinDate(new Date())));
}
