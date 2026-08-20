import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";

/**
 * GET /api/notifications — alerts for my role (duty_manager sees all).
 * POST — supervisor raises one to duty_manager (currently just the
 * "need more Room Attendants" ask from the planning board).
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

const StaffingRequestBody = z.object({
  message: z.string().trim().min(1).max(500),
});

/** POST /api/notifications — supervisor asks the duty manager for more hands. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = StaffingRequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "message is required." }, { status: 400 });

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
  if (!parsed.success) return NextResponse.json({ error: "Pass {id} or {all:true}." }, { status: 400 });

  const roleFilter = auth.session.role === "duty_manager" ? {} : { targetRole: auth.session.role };
  if ("all" in parsed.data) {
    await prisma.notification.updateMany({ where: { ...roleFilter, acknowledged: false }, data: { acknowledged: true } });
  } else {
    await prisma.notification.updateMany({ where: { id: parsed.data.id, ...roleFilter }, data: { acknowledged: true } });
  }
  return NextResponse.json({ ok: true });
}
