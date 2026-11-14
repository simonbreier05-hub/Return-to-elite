import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { berlinToday } from "@/lib/import/businessDay";
import { ensureRecurringTasks } from "@/lib/houseman/recurring";

const Body = z.object({
  roomNumber: z.string().trim().min(1).max(10),
  label: z.string().trim().min(1).max(80),
  everyDays: z.number().int().min(1).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

/**
 * Betrieb L2 (Punkt 9): wiederkehrende Hausmann-Aufgaben. GET = Liste, POST = neu (Zimmer, Text, alle N Tage, ab Datum —
 * Standard heute). Supervisor und Hausmann (Duty Manager immer). Text ist interner Kurztext des Teams, nie Gastdaten;
 * im Logbuch nur Zimmer und Zyklus.
 */
export async function GET() {
  const auth = await requireRole(["supervisor", "houseman"]);
  if (!auth.ok) return auth.response;
  const tasks = await prisma.recurringTask.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }], include: { room: { select: { number: true, floor: true } } } });
  return NextResponse.json({ tasks: tasks.map((t) => ({ id: t.id, roomNumber: t.room.number, floor: t.room.floor, label: t.label, everyDays: t.everyDays, startDate: t.startDate, active: t.active, lastCreatedOn: t.lastCreatedOn })) });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor", "houseman"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben.", code: "INVALID_INPUT" }, { status: 400 });
  const room = await prisma.room.findUnique({ where: { number: parsed.data.roomNumber }, select: { id: true, number: true } });
  if (!room) return NextResponse.json({ error: "Zimmer nicht gefunden.", code: "ROOM_NOT_FOUND" }, { status: 404 });
  const today = berlinToday();
  const task = await prisma.recurringTask.create({
    data: { roomId: room.id, label: parsed.data.label, everyDays: parsed.data.everyDays, startDate: parsed.data.startDate ?? today, createdById: auth.session.userId },
  });
  await audit({ action: "RECURRING_TASK_CREATED", userId: auth.session.userId, roomId: room.id, meta: { everyDays: task.everyDays, startDate: task.startDate } });
  await ensureRecurringTasks(today); // heute fällig → sofort auf der Liste
  return NextResponse.json({ ok: true, id: task.id }, { status: 201 });
}
