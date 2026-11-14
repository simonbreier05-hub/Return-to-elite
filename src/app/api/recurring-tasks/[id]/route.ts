import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const Body = z.object({ active: z.boolean() }).strict();

/** PATCH /api/recurring-tasks/[id] — Betrieb L2 (Punkt 9): pausieren/wieder aktivieren. Supervisor, Hausmann (DM immer). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor", "houseman"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben.", code: "INVALID_INPUT" }, { status: 400 });
  const task = await prisma.recurringTask.update({ where: { id }, data: { active: parsed.data.active } }).catch(() => null);
  if (!task) return NextResponse.json({ error: "Nicht gefunden.", code: "NOT_FOUND" }, { status: 404 });
  await audit({ action: "RECURRING_TASK_UPDATED", userId: auth.session.userId, roomId: task.roomId, meta: { active: task.active } });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/recurring-tasks/[id] — Betrieb L2 (Punkt 9): entfernt die Regel; schon angelegte Aufgaben bleiben stehen. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor", "houseman"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const task = await prisma.recurringTask.delete({ where: { id } }).catch(() => null);
  if (!task) return NextResponse.json({ error: "Nicht gefunden.", code: "NOT_FOUND" }, { status: 404 });
  await audit({ action: "RECURRING_TASK_DELETED", userId: auth.session.userId, roomId: task.roomId });
  return NextResponse.json({ ok: true });
}
