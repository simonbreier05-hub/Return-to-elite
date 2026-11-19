import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { RoomTaskTypeSchema } from "@/lib/domain";
import { createRoomTask } from "@/lib/rooms/createRoomTask";
import { activePauses } from "@/lib/work/pauseData";
import { berlinToday } from "@/lib/import/businessDay";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { ensureRecurringTasks } from "@/lib/houseman/recurring";

/** GET /api/roomtasks — the houseman queue (visible to all authenticated roles, like /api/workorders). */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  // Betrieb L2 (Punkt 9): heute fällige wiederkehrende Aufgaben anlegen (idempotent); Anreisezeit für die Sortierung
  const today = berlinToday();
  await ensureRecurringTasks(today).catch(() => 0);
  const etaBy = new Map((await prisma.dayRoomPlan.findMany({ where: { date: today, eta: { not: null } }, select: { roomId: true, eta: true } })).map((p) => [p.roomId, p.eta]));
  // F7 (H16/M15): offene Aufgaben jeden Alters (Einmal-Aufgabe erst ab ihrem Datum), erledigte nur von heute
  const todayStart = berlinToUtc(today, "00:00");
  const roomTasks = await prisma.roomTask.findMany({
    where: { OR: [{ status: "OPEN", OR: [{ dueDate: null }, { dueDate: { lte: today } }] }, { status: "DONE", doneAt: { gte: todayStart } }] },
    orderBy: [{ createdAt: "desc" }],
    include: {
      room: { select: { id: true, number: true, floor: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  const pauses = await activePauses("ROOMTASK", roomTasks.filter((t) => t.status === "OPEN").map((t) => t.id));
  const dayOf = (d: Date) => berlinDate(d);
  return NextResponse.json({ roomTasks: roomTasks.map((t) => ({
    ...t, eta: etaBy.get(t.roomId) ?? null, pause: pauses.get(t.id) ?? null,
    // „aufgeschoben seit“ / „überfällig seit“ — Tag, seit dem die Aufgabe offen mitläuft
    since: t.status !== "OPEN" ? null : t.deferredSince ?? t.overdueSince ?? (t.dueDate && t.dueDate < today ? t.dueDate : dayOf(t.createdAt) < today ? dayOf(t.createdAt) : null),
  })) });
}

/**
 * POST /api/roomtasks — a supervisor hands the houseman a furniture/bed job
 * (e.g. "room 207 to twin"). Analogous to defect reporting, but no photo,
 * category or engineering routing — see the RoomTask model for why this
 * stays a separate, deliberately minimal model.
 */
const Body = z.object({
  roomId: z.string().min(1),
  type: RoomTaskTypeSchema,
  note: z.string().max(500).optional(),
  /** F7 (Aufgabe 10): Einmal-Aufgabe für einen bestimmten Tag „YYYY-MM-DD“ (erscheint ab diesem Tag). */
  dueDate: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor", "duty_manager"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid room task.", code: "INVALID_INPUT" }, { status: 400 });
  const { roomId, type, note, dueDate } = parsed.data;
  // Review (N4): Einmal-Aufgabe nie für einen vergangenen Tag (die Oberfläche setzt min, der Server prüft selbst)
  if (dueDate && dueDate < berlinToday()) return NextResponse.json({ error: "Date is in the past.", code: "DUE_DATE_PAST" }, { status: 400 });
  if (type === "SONSTIGES" && !note?.trim()) {
    return NextResponse.json({ error: "A note is required for type SONSTIGES.", code: "TEXT_REQUIRED" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, number: true } });
  if (!room) return NextResponse.json({ error: "Room not found.", code: "ROOM_NOT_FOUND" }, { status: 404 });

  const roomTask = await createRoomTask({
    room,
    type,
    note: note?.trim() || null,
    createdById: auth.session.userId,
    dueDate: dueDate ?? null,
  });

  return NextResponse.json({ roomTask }, { status: 201 });
}
