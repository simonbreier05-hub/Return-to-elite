import { NextResponse } from "next/server";
import { hubDay } from "@/lib/dayplan/hubDay";
import { requireRole } from "@/lib/rbac";
import { getServiceOverview } from "@/lib/lists/serviceOverview";
import { getDayNumbers } from "@/lib/dayplan/dayNumbersData";
import { teamIdsFor } from "@/lib/autoplan/load";

/**
 * GET /api/lists/service — Zimmer und Service heute (Supervisor: eigene Etagen, Duty Manager: alle).
 * `numbers` sind die hausweiten Tageszahlen aus derselben Quelle wie Duty-Manager-Board und Entwurf (getDayNumbers).
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const hub = await hubDay();
  const numbers = hub.ready ? (await getDayNumbers(hub.date, await teamIdsFor(hub.date))).numbers : null;
  return NextResponse.json({ hub, numbers, ...(await getServiceOverview(auth.session)) });
}
