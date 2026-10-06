import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";
import { listSuggestions } from "@/lib/autoplan/service";

/** GET /api/redistribution — offene Umverteilungsvorschläge von heute (Karten für den Supervisor). */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date") ?? berlinDate(new Date());
  return NextResponse.json(await listSuggestions(date));
}
