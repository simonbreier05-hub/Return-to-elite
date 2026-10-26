import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";
import { planStatus } from "@/lib/import/deleteList";
import { dataStatus } from "@/lib/import/store";

/** GET /api/import/status?date= — "Stand der Daten" je Liste für den Betriebstag (Standard: heute, Berlin) + Plan-Hinweis. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const q = req.nextUrl.searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : berlinDate(new Date());
  return NextResponse.json({ date, status: await dataStatus(date), plan: await planStatus(date) });
}
