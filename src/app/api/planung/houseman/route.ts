import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

const Body = z.object({
  assignments: z.array(z.object({ traceId: z.string().min(1), userId: z.string().min(1).nullable() }).strict()).max(500),
}).strict();

/**
 * PUT /api/planung/houseman — Hausmann-Aufgaben (Traces der Abteilung Hausmann) den Hausmännern zuteilen (null = für alle).
 * Wird beim Bestätigen des Plans aufgerufen; nur Supervisor/Duty Manager. Keine Namen/Texte im Protokoll.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  const users = new Set((await prisma.user.findMany({ where: { role: "houseman" }, select: { id: true } })).map((u) => u.id));
  if (parsed.data.assignments.some((a) => a.userId && !users.has(a.userId))) return NextResponse.json({ error: "Unbekannter Hausmann." }, { status: 400 });
  let changed = 0;
  const gained = new Map<string, number>();
  for (const a of parsed.data.assignments) {
    const t = await prisma.trace.findUnique({ where: { id: a.traceId } });
    if (!t || t.dept !== "HOUSEMAN" || t.assignedToId === a.userId) continue;
    await prisma.trace.update({ where: { id: t.id }, data: { assignedToId: a.userId } });
    changed++;
    if (a.userId) gained.set(a.userId, (gained.get(a.userId) ?? 0) + 1);
  }
  // Spätere Änderung nach der Bestätigung: nur die betroffenen Hausmänner erfahren es
  for (const [userId, n] of gained) {
    if (userId === auth.session.userId) continue;
    const notification = await prisma.notification.create({ data: { type: "HOUSEMAN_TASKS_ASSIGNED", level: "info", targetRole: "houseman", targetUserId: userId, message: `Dir ${n === 1 ? "wurde 1 Aufgabe" : `wurden ${n} Aufgaben`} zugeteilt.` } });
    broadcast("notification:new", { notification });
  }
  if (changed) {
    await audit({ action: "HOUSEMAN_TASKS_ASSIGNED", userId: auth.session.userId, meta: { changed } });
    broadcast("trace:update", { assigned: changed }); // keine Gastdaten
  }
  return NextResponse.json({ ok: true, changed });
}
