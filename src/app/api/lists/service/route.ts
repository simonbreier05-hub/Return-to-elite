import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getServiceOverview } from "@/lib/lists/serviceOverview";

/** GET /api/lists/service — Zimmer und Service heute (Supervisor: eigene Etagen, Duty Manager: alle). */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getServiceOverview(auth.session));
}
