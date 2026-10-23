import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { dataStatus } from "@/lib/import/store";
import { berlinToday } from "@/lib/import/businessDay";

/** GET /api/import/status — "Stand der Daten" je Liste (für Import-Seite und Planungshub). */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ status: await dataStatus(), today: berlinToday() });
}
