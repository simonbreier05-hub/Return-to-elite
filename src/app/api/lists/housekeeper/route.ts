import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getHousekeeperList } from "@/lib/lists/housekeeperList";

/**
 * GET /api/lists/housekeeper — die eigene Zimmerliste eines Housekeepers (Laufplan-Reihenfolge).
 * Liefert nur die eigenen Zimmer; Gäste nur als „Anrede Titel Nachname" (nie Vornamen, nie Alter).
 */
export async function GET() {
  const auth = await requireRole(["room_attendant"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getHousekeeperList(auth.session.userId));
}
