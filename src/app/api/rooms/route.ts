import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { resolveFloorScope } from "@/lib/floors";
import { shortGuestName } from "@/lib/lists/guestName";

/**
 * GET /api/rooms — full board (optionally ?mine=1 for the attendant view, or
 * ?q=<partial number> for the global quick search — mutually exclusive with
 * ?mine).
 *
 * A supervisor with floors assigned (see PATCH /api/users/[id]/floors) only
 * gets back rooms on those floors — this is what makes the duty manager's
 * floor assignment actually mean something on the Live Board, rather than
 * being purely informational. A supervisor with no floors assigned yet
 * fails open (sees the whole house), so an unconfigured account isn't
 * silently locked out. Pass ?allFloors=1 to bypass this for a caller that
 * genuinely needs the whole house regardless of role — the floor-plan
 * reference page (wayfinding, not "my work area") is the one place that does.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const mine = req.nextUrl.searchParams.get("mine") === "1";
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const allFloors = req.nextUrl.searchParams.get("allFloors") === "1";
  const where: { number?: { contains: string }; assignedToId?: string; floor?: { in: number[] } } = q
    ? { number: { contains: q } }
    : mine
      ? { assignedToId: auth.session.userId }
      : {};

  let floorScope: number[] | null = null;
  if (auth.session.role === "supervisor" && !allFloors) {
    const supervisor = await prisma.user.findUnique({
      where: { id: auth.session.userId },
      select: { assignedFloors: true },
    });
    floorScope = resolveFloorScope({ role: auth.session.role, assignedFloorsRaw: supervisor?.assignedFloors, allFloors });
    if (floorScope) where.floor = { in: floorScope };
  }

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { number: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true, dailyNumber: true } },
      arrivals: { where: { status: "EXPECTED" } },
      excursions: { where: { endsAt: { gte: new Date() } } },
      notes: { orderBy: { createdAt: "desc" }, take: 3, include: { author: { select: { name: true, role: true } } } },
      defects: {
        include: { workOrder: true, reportedBy: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 2,
      },
      // Guest screen requests (Prompt G2 Teil 4) — still-open ones only, for
      // the room detail modal's "Gästeanfragen" list. Capped to the 5 most
      // recent for display; guestDndActive below is computed separately so a
      // burst of other open requests can never push an active DND out of
      // this list and hide it.
      guestRequests: {
        where: { status: { in: ["RECEIVED", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      _count: { select: { notes: { where: { status: "OPEN" } } } },
    },
  });

  // Guest DND never touches Room.status/blockReason (see
  // src/lib/guestActions.ts), so this unlimited, DND-only query is the only
  // way a screen knows a guest currently has Do Not Disturb active — it must
  // not share the take: 5 cap above, which exists only for display.
  const dndRoomIds = new Set(
    (
      await prisma.guestRequest.findMany({
        where: { kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } },
        select: { roomId: true },
      })
    ).map((r) => r.roomId)
  );

  // Housekeeper sehen Gäste nur als „Anrede Titel Nachname" — von Hand erfasste Namen werden hier gekürzt (nie Vornamen).
  const attendantView = auth.session.role === "room_attendant";
  const roomsWithCounts = rooms.map(({ _count, guestRequests, ...room }) => ({
    ...room,
    ...(attendantView ? { arrivals: room.arrivals.map((a) => ({ ...a, guestName: shortGuestName(a.guestName, a.source) ?? "—" })) } : {}),
    openNotesCount: _count.notes,
    guestRequests,
    guestDndActive: dndRoomIds.has(room.id),
  }));

  const attendants = await prisma.user.findMany({
    where: { role: "room_attendant" },
    select: { id: true, name: true, section: true, currentRoomId: true, lastSeenAt: true, dailyNumber: true },
  });

  return NextResponse.json({ rooms: roomsWithCounts, attendants, floorScope });
}
