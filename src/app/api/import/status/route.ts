import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { dataStatus } from "@/lib/import/store";
import { berlinToday } from "@/lib/import/businessDay";
import { planStatus } from "@/lib/import/deleteList";

/** GET /api/import/status — "Stand der Daten" je Liste (für Import-Seite und Planungshub) + Plan-Hinweis für den Betriebstag. */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const today = berlinToday();
  return NextResponse.json({ status: await dataStatus(), today, plan: await planStatus(today) });
}
