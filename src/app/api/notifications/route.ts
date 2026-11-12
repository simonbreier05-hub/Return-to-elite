import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";

/**
 * GET /api/notifications — alerts for my role (duty_manager sees all).
 * POST — supervisor raises one to duty_manager (currently just the
 * "need more Room Attendants" ask from the planning board).
 * PATCH — acknowledge one ({id}) or all ({all:true}) of my alerts.
 *
 * „Gelesen“ hängt (noch) an der Meldung selbst (`Notification.acknowledged`, ohne Personenbezug). Deshalb quittiert
 * PATCH nur Meldungen, die an mich gehen: an meine Rolle ohne Person oder an mich persönlich. Der Duty Manager *liest*
 * alle Rollen (Übersicht), quittiert aber nur Meldungen an den Duty Manager bzw. an sich selbst — sonst würde sein
 * „Alle gelesen“ die Glocke jeder anderen Kraft leeren.
 */
/** Meldungen für mich: meine Rolle, und wenn eine Meldung an eine Person gerichtet ist, nur wenn ich es bin (Duty Manager sieht alle). */
function scopeFor(session: { role: string; userId: string }) {
  return session.role === "duty_manager" ? {} : { targetRole: session.role, OR: [{ targetUserId: null }, { targetUserId: session.userId }] };
}

/** Was ich quittieren darf: meine Rolle ohne Person, oder an mich persönlich (gilt auch für den Duty Manager). */
function ackScopeFor(session: { role: string; userId: string }) {
  return { OR: [{ targetRole: session.role, targetUserId: null }, { targetUserId: session.userId }] };
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const notifications = await prisma.notification.findMany({
    where: scopeFor(auth.session),
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // `me`: damit der Client „an mich gerichtet“ (Pop-up, Ton, Zähler) ohne eigene Abfrage entscheiden kann.
  return NextResponse.json({ notifications, me: { role: auth.session.role, userId: auth.session.userId } });
}

const StaffingRequestBody = z.object({
  message: z.string().trim().min(1).max(500),
});

/** POST /api/notifications — supervisor asks the duty manager for more hands. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = StaffingRequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "message is required.", code: "TEXT_REQUIRED" }, { status: 400 });

  const notification = await prisma.notification.create({
    data: {
      type: "STAFFING_REQUEST",
      level: "warning",
      targetRole: "duty_manager",
      message: parsed.data.message,
    },
  });
  broadcast("notification:new", { notification });
  return NextResponse.json({ notification }, { status: 201 });
}

const Body = z.union([z.object({ id: z.string() }), z.object({ all: z.literal(true) })]);

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pass {id} or {all:true}.", code: "INVALID_INPUT" }, { status: 400 });

  const mine = ackScopeFor(auth.session);
  if ("all" in parsed.data) {
    await prisma.notification.updateMany({ where: { ...mine, acknowledged: false }, data: { acknowledged: true } });
  } else {
    await prisma.notification.updateMany({ where: { id: parsed.data.id, ...mine }, data: { acknowledged: true } });
  }
  return NextResponse.json({ ok: true });
}
