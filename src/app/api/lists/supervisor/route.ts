import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getSupervisorList } from "@/lib/lists/supervisorList";

/**
 * GET /api/lists/supervisor — Etagenliste des Supervisors: nur die ihm zugeteilten Etagen (Duty Manager: alle,
 * optional ?floors=1,2). Ein Supervisor kann nie fremde Etagen anfordern.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const requested = (req.nextUrl.searchParams.get("floors") ?? "").split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  return NextResponse.json(await getSupervisorList(auth.session, requested));
}
