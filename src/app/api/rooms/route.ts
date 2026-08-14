import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

/** GET /api/rooms — full board (optionally ?mine=1 for the attendant view). */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const mine = req.nextUrl.searchParams.get("mine") === "1";
  const rooms = await prisma.room.findMany({
    where: mine ? { assignedToId: auth.session.userId } : undefined,
    orderBy: { number: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true } },
      arrivals: { where: { status: "EXPECTED" } },
      excursions: { where: { endsAt: { gte: new Date() } } },
      notes: { orderBy: { createdAt: "desc" }, take: 3, include: { author: { select: { name: true, role: true } } } },
      defects: { include: { workOrder: true }, orderBy: { createdAt: "desc" }, take: 2 },
    },
  });

  const attendants = await prisma.user.findMany({
    where: { role: "room_attendant" },
    select: { id: true, name: true, section: true, currentRoomId: true, lastSeenAt: true },
  });

  return NextResponse.json({ rooms, attendants });
}
