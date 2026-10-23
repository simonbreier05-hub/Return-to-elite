import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getHousemanList } from "@/lib/lists/housemanList";
import { floorsFor } from "@/lib/lists/supervisorList";

/** GET /api/lists/houseman?floor= — Hausmann-Liste des Tages (Traces der Abteilung Hausmann), optional nach Etage. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["houseman", "supervisor"]);
  if (!auth.ok) return auth.response;
  const floor = parseInt(req.nextUrl.searchParams.get("floor") ?? "", 10);
  const onlyFloors = auth.session.role === "supervisor" ? await floorsFor(auth.session) : null; // Supervisor: nur die zugeteilten Etagen
  return NextResponse.json(await getHousemanList(Number.isFinite(floor) ? floor : null, auth.session.role === "houseman" ? auth.session.userId : null, onlyFloors));
}
