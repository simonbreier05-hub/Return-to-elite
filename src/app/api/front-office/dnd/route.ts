import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

/** GET /api/front-office/dnd — F3 Teil 2: offene „Bitte nicht stören“ der Gäste (nur Zimmer und seit wann, keine Gastdaten). */
export async function GET() {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.guestRequest.findMany({
    where: { kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } }, orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, room: { select: { id: true, number: true, floor: true } } },
  });
  return NextResponse.json({ dnd: rows.map((r) => ({ id: r.id, since: r.createdAt.toISOString(), room: r.room })) });
}
