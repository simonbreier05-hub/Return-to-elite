import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { berlinDate } from "@/lib/dayplan/time";
import { loadWorkData, statsFor } from "@/lib/workdata/load";

/** GET /api/workdata/me — Housekeeper sehen nur ihre eigenen Werte (keine anderen Personen, keine Hauswerte). */
export async function GET() {
  const auth = await requireRole(["room_attendant"]);
  if (!auth.ok) return auth.response;
  const set = await loadWorkData(berlinDate(new Date()));
  return NextResponse.json({ since: set.since, minSamples: set.minSamples, stats: statsFor(set, auth.session.userId) });
}
