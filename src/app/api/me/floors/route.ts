import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { parseAssignedFloors } from "@/lib/floors";
import { berlinDate } from "@/lib/dayplan/time";

/** GET /api/me/floors — eigene Etage(n) heute laut Etagenzuweisung (H1). Housekeeper/Hausmann nur, wenn floorsOn = heute. */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const u = await prisma.user.findUnique({ where: { id: auth.session.userId }, select: { role: true, assignedFloors: true, floorsOn: true } });
  const floors = !u ? [] : u.role === "supervisor" || u.floorsOn === berlinDate(new Date()) ? parseAssignedFloors(u.assignedFloors) : [];
  return NextResponse.json({ floors });
}
