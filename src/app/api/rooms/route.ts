import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

/**
 * GET /api/rooms — full board (optionally ?mine=1 for the attendant view, or
 * ?q=<partial number> for the global quick search — mutually exclusive with
 * ?mine).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const mine = req.nextUrl.searchParams.get("mine") === "1";
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const where = q ? { number: { contains: q } } : mine ? { assignedToId: auth.session.userId } : undefined;

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { number: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true } },
      arrivals: { where: { status: "EXPECTED" } },
      excursions: { where: { endsAt: { gte: new Date() } } },
      notes: { orderBy: { createdAt: "desc" }, take: 3, include: { author: { select: { name: true, role: true } } } },
      defects: { include: { workOrder: true }, orderBy: { createdAt: "desc" }, take: 2 },
      _count: { select: { notes: { where: { status: "OPEN" } } } },
    },
  });

  const roomsWithCounts = rooms.map(({ _count, ...room }) => ({ ...room, openNotesCount: _count.notes }));

  const attendants = await prisma.user.findMany({
    where: { role: "room_attendant" },
    select: { id: true, name: true, section: true, currentRoomId: true, lastSeenAt: true },
  });

  return NextResponse.json({ rooms: roomsWithCounts, attendants });
}
