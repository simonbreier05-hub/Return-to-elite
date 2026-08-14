import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

/**
 * GET /api/notifications — alerts for my role (duty_manager sees all).
 * PATCH — acknowledge one ({id}) or all ({all:true}) of my role's alerts.
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { role } = auth.session;
  const notifications = await prisma.notification.findMany({
    where: role === "duty_manager" ? {} : { targetRole: role },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ notifications });
}

const Body = z.union([z.object({ id: z.string() }), z.object({ all: z.literal(true) })]);

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pass {id} or {all:true}." }, { status: 400 });

  const roleFilter = auth.session.role === "duty_manager" ? {} : { targetRole: auth.session.role };
  if ("all" in parsed.data) {
    await prisma.notification.updateMany({ where: { ...roleFilter, acknowledged: false }, data: { acknowledged: true } });
  } else {
    await prisma.notification.updateMany({ where: { id: parsed.data.id, ...roleFilter }, data: { acknowledged: true } });
  }
  return NextResponse.json({ ok: true });
}
