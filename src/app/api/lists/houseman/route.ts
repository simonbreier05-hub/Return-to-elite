import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getHousemanList } from "@/lib/lists/housemanList";

/** GET /api/lists/houseman?floor= — Hausmann-Liste des Tages (Traces der Abteilung Hausmann), optional nach Etage. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["houseman", "supervisor"]);
  if (!auth.ok) return auth.response;
  const floor = parseInt(req.nextUrl.searchParams.get("floor") ?? "", 10);
  return NextResponse.json(await getHousemanList(Number.isFinite(floor) ? floor : null));
}
