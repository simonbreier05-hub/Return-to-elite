import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getLiveOverview } from "@/lib/lists/overview";

/** GET /api/lists/overview — Live-Einsicht auf alle Listen (Supervisor-Fortschritt, Hausmann-Aufgaben). Nur Duty Manager. */
export async function GET() {
  const auth = await requireRole([]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getLiveOverview());
}
