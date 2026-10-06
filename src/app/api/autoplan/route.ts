import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { latestProposal } from "@/lib/autoplan/service";

/**
 * GET /api/autoplan?date= — letzter Vorschlag (Entwurf oder bestätigt) des Tages.
 * Enthält Stufe/Typ der Housekeeper: nur Supervisor und Duty Manager (Beschäftigtendaten).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date") ?? (await latestPlanDate());
  if (!date) return NextResponse.json({ date: null, proposal: null });
  return NextResponse.json({ date, proposal: await latestProposal(date) });
}
