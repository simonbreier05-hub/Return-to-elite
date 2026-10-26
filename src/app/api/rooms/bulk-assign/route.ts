import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import { notifyBulkReassignment } from "@/lib/rooms/notifyBulkReassignment";

const Body = z.object({
  roomIds: z.array(z.string().min(1)).min(1).max(200),
  attendantId: z.string().nullable(),
  confirmStarted: z.boolean().optional(),
}).strict();

/**
 * POST /api/rooms/bulk-assign — mehrere Zimmer in einem Schritt einer Kraft zuteilen (oder, mit attendantId null, freigeben).
 * Nur Supervisor/Duty Manager. Keine Sperren; begonnene/fertige Zimmer nur mit confirmStarted (sonst 409 STARTED_ROOMS,
 * es wird dann nichts geändert). Eine Meldung je betroffener Person, nicht je Zimmer.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "roomIds und attendantId (oder null) erforderlich." }, { status: 400 });
  const { roomIds, attendantId, confirmStarted } = parsed.data;
  if (attendantId) {
    const a = await prisma.user.findUnique({ where: { id: attendantId } });
    if (!a || a.role !== "room_attendant") return NextResponse.json({ error: "attendantId muss ein Zimmermädchen sein." }, { status: 400 });
  }
  const before = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true, floor: true, status: true, assignedToId: true } });
  if (before.length !== new Set(roomIds).size) return NextResponse.json({ error: "Unbekanntes Zimmer in der Auswahl." }, { status: 400 });
  const changing = before.filter((r) => r.assignedToId !== attendantId);
  const started = changing.filter((r) => isStartedStatus(r.status) && r.assignedToId);
  if (started.length && !confirmStarted) {
    return NextResponse.json({ error: `${started.length} Zimmer sind schon begonnen oder fertig. Trotzdem ändern?`, code: "STARTED_ROOMS", rooms: started.map((r) => r.number) }, { status: 409 });
  }
  const today = berlinDate(new Date());
  const nextOrder = attendantId
    ? ((await prisma.room.aggregate({ where: { assignedToId: attendantId }, _max: { routeOrder: true } }))._max.routeOrder ?? -1) + 1
    : 0;
  const ordered = [...changing].sort((a, b) => a.number.localeCompare(b.number));
  const updated = await prisma.$transaction(ordered.map((r, i) => prisma.room.update({
    where: { id: r.id },
    data: { assignedToId: attendantId, assignedOn: attendantId ? today : null, routeOrder: attendantId ? nextOrder + i : null },
    include: { assignedTo: { select: { id: true, name: true, dailyNumber: true } } },
  })));
  await audit({ action: "ROOMS_BULK_ASSIGNED", userId: auth.session.userId, meta: { attendantId, rooms: ordered.length, started: started.length } });
  await notifyBulkReassignment({ rooms: ordered.map((r) => ({ id: r.id, number: r.number, floor: r.floor, fromId: r.assignedToId })), toId: attendantId, actorId: auth.session.userId });
  for (const room of updated) broadcast("room:update", { room });
  return NextResponse.json({ rooms: updated, changed: updated.length });
}
