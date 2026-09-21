import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { FLOORS } from "@/lib/domain";
import { parseAssignedFloors } from "@/lib/floors";
import { assignFloors } from "@/lib/users/assignFloors";

/**
 * PATCH /api/users/[id]/floors — duty manager assigns which floor(s) a
 * supervisor is responsible for. Informational only for now: it does not
 * change what the supervisor screen itself shows (see prompt for why that
 * enforcement is a separate, later change).
 */
const Body = z.object({ floors: z.array(z.number().int()) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "floors must be an array of floor numbers." }, { status: 400 });

  const floors = parsed.data.floors;
  if (floors.some((f) => !(FLOORS as readonly number[]).includes(f))) {
    return NextResponse.json({ error: `floors must be within ${FLOORS.join(", ")}.` }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.role !== "supervisor") {
    return NextResponse.json({ error: "Floors can only be assigned to a supervisor." }, { status: 400 });
  }

  const updated = await assignFloors({ user, floors, actorId: auth.session.userId });
  return NextResponse.json({ user: { ...updated, assignedFloors: parseAssignedFloors(updated.assignedFloors) } });
}
