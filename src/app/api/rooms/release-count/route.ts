import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { resolveFloorScope } from "@/lib/floors";
import { hubDay } from "@/lib/dayplan/hubDay";

/**
 * GET /api/rooms/release-count — Simon-Feedback 19.11.: Zahl neben „Freigabe“ in der Leiste. Zählt die Zimmer „Rein · zu
 * prüfen“ (CLEAN) in den Etagen des Supervisors (gleiche Regel wie `GET /api/rooms`), ohne Zimmer- oder Gastdaten.
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const hub = await hubDay();
  if (!hub.ready) return NextResponse.json({ count: 0 });
  let floor: { in: number[] } | undefined;
  if (auth.session.role === "supervisor") {
    const me = await prisma.user.findUnique({ where: { id: auth.session.userId }, select: { assignedFloors: true } });
    const scope = resolveFloorScope({ role: auth.session.role, assignedFloorsRaw: me?.assignedFloors, allFloors: false });
    if (scope) floor = { in: scope };
  }
  const count = await prisma.room.count({ where: { status: "CLEAN", active: true, ...(floor ? { floor } : {}) } });
  return NextResponse.json({ count });
}
