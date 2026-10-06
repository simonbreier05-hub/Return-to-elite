import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getHouseData } from "@/lib/planung/house";

/** GET /api/planung/house?date= — Haus-Ansicht des Planungstools (Kacheln, Etagen, Supervisor-Badges). Keine Gastdaten. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
  return NextResponse.json(await getHouseData(date));
}
