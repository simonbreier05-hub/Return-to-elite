import { now as clockNow } from "@/lib/clock";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";
import { listSuggestions } from "@/lib/autoplan/service";
import { hubDay } from "@/lib/dayplan/hubDay";

/** GET /api/redistribution — offene Umverteilungsvorschläge von heute (Karten für den Supervisor). */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date") ?? berlinDate(clockNow());
  // Vorschläge beruhen auf dem Tagesplan; ohne heutigen Tagesplan aus dem Planungshub keine Karten.
  if (date === berlinDate(clockNow()) && !(await hubDay()).ready) return NextResponse.json({ suggestions: [], attendants: [] });
  return NextResponse.json(await listSuggestions(date));
}
