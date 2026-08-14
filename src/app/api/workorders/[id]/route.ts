import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { WorkOrderStatusSchema, type WorkOrderStatus } from "@/lib/domain";

/**
 * PATCH /api/workorders/[id] — engineering advances a work order:
 * OPEN → ACK → IN_PROGRESS → RESOLVED (forward-only, enforced server-side).
 */
const ORDER: WorkOrderStatus[] = ["OPEN", "ACK", "IN_PROGRESS", "RESOLVED"];

const Body = z.object({ status: WorkOrderStatusSchema });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["engineering", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid work order status." }, { status: 400 });

  const wo = await prisma.workOrder.findUnique({ where: { id }, include: { defect: { include: { room: true } } } });
  if (!wo) return NextResponse.json({ error: "Work order not found." }, { status: 404 });

  const from = WorkOrderStatusSchema.parse(wo.status);
  const to = parsed.data.status;
  if (ORDER.indexOf(to) !== ORDER.indexOf(from) + 1) {
    return NextResponse.json({ error: `Illegal work order transition ${from} → ${to}.` }, { status: 409 });
  }

  const now = new Date();
  const workOrder = await prisma.workOrder.update({
    where: { id },
    data: {
      status: to,
      assignedToId: auth.session.role === "engineering" ? auth.session.userId : wo.assignedToId,
      ackAt: to === "ACK" ? now : wo.ackAt,
      startedAt: to === "IN_PROGRESS" ? now : wo.startedAt,
      resolvedAt: to === "RESOLVED" ? now : wo.resolvedAt,
    },
    include: {
      defect: { include: { room: { select: { id: true, number: true, status: true } }, reportedBy: { select: { name: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  await audit({
    action: "WORK_ORDER_UPDATED",
    userId: auth.session.userId,
    roomId: wo.defect.roomId,
    meta: { workOrderId: id, from, to },
  });

  if (to === "RESOLVED") {
    const notification = await prisma.notification.create({
      data: {
        type: "WORK_ORDER_RESOLVED",
        level: "info",
        targetRole: "supervisor",
        roomId: wo.defect.roomId,
        message: `Work order resolved in room ${wo.defect.room.number} (${wo.defect.category}). Room may resume cleaning.`,
        dedupeKey: `WORK_ORDER_RESOLVED:${id}`,
      },
    });
    broadcast("notification:new", { notification });
  }

  broadcast("workorder:update", { workOrder });
  return NextResponse.json({ workOrder });
}
