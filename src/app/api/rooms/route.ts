import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { resolveFloorScope } from "@/lib/floors";
import { shortGuestName } from "@/lib/lists/guestName";
import { assignedToday, hubDay } from "@/lib/dayplan/hubDay";
import { activePauses } from "@/lib/work/pauseData";
import { rewindOptions } from "@/lib/rooms/rewindData";
import { canSeeMessages } from "@/lib/work/access";

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
 *
 * Tagesdaten kommen nur aus dem Planungshub (`hubDay`): Gibt es für heute keinen Tagesplan, liefern Board,
 * Grundriss und „Meine Zimmer" keine Zimmer, sondern `hub.ready=false` (die Oberfläche zeigt den Hinweis).
 * Die Schnellsuche (?q=) findet Zimmer weiter, aber ohne Tagesdaten. Zuteilungen zählen nur, wenn sie von heute sind.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const mine = req.nextUrl.searchParams.get("mine") === "1";
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const allFloors = req.nextUrl.searchParams.get("allFloors") === "1";
  const hub = await hubDay();
  if (!hub.ready && !q) return NextResponse.json({ rooms: [], attendants: [], floorScope: null, hub });
  const where: { number?: { contains: string }; assignedToId?: string; assignedOn?: string; floor?: { in: number[] } } = q
    ? { number: { contains: q } }
    : mine
      ? { assignedToId: auth.session.userId, assignedOn: hub.date }
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

  // Aktive Pausen (eigenes Signal, ändert nie den Status) und — nur für „Meine Zimmer“ — der zurückspulbare letzte Schritt.
  const pauses = await activePauses("ROOM", rooms.filter((r) => r.status === "IN_PROGRESS").map((r) => r.id));
  const rewinds = mine && hub.ready ? await rewindOptions(auth.session, rooms) : new Map<string, { to: string; until: string }>();

  // Housekeeper sehen Gäste nur als „Anrede Titel Nachname" — von Hand erfasste Namen werden hier gekürzt (nie Vornamen).
  const attendantView = auth.session.role === "room_attendant";
  const me = auth.session.userId;
  const roomsWithCounts = rooms.map(({ _count, guestRequests, ...raw }) => {
    // Ohne heutigen Tagesplan (nur Schnellsuche) bzw. bei einer Zuteilung von gestern: keine Tagesdaten zeigen.
    const room = !hub.ready ? { ...raw, isCheckoutToday: false, assignedToId: null, assignedTo: null, routeOrder: null, arrivals: [] }
      : assignedToday(raw.assignedOn, hub.date) ? raw : { ...raw, assignedToId: null, assignedTo: null, routeOrder: null };
    return {
    ...room,
    // Housekeeper sehen fremde Zuteilungen nicht (nur ihre eigenen Zimmer tragen einen Namen).
    ...(attendantView && room.assignedToId !== me ? { assignedToId: null, assignedTo: null, routeOrder: null } : {}),
    ...(attendantView ? { arrivals: room.arrivals.map((a) => ({ ...a, guestName: shortGuestName(a.guestName, a.source) ?? "—" })) } : {}),
    openNotesCount: _count.notes,
    // Nachrichten (kind MESSAGE) nur für Beteiligte; die Vorschau kennt nur Zimmermädchen/Supervisor/Duty Manager als Beteiligte.
    notes: room.notes.filter((n) => n.kind !== "MESSAGE" || canSeeMessages(
      { role: auth.session.role, userId: me, floors: floorScope },
      { floor: room.floor, housekeeperId: room.assignedToId, housemanIds: [], engineerIds: [] },
    )),
    pause: pauses.get(room.id) ?? null,
    rewind: rewinds.get(room.id) ?? null,
    guestRequests,
    guestDndActive: dndRoomIds.has(room.id),
  };
  });

  const attendants = await prisma.user.findMany({
    where: { role: "room_attendant" },
    select: { id: true, name: true, section: true, currentRoomId: true, lastSeenAt: true, dailyNumber: true },
  });

  return NextResponse.json({ rooms: roomsWithCounts, attendants, floorScope, hub });
}
