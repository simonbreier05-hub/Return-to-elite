import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { WorkOrderStatusSchema, type WorkOrderStatus } from "@/lib/domain";
import { endPauseOnChange } from "@/lib/work/pauseData";
import { keyed } from "@/lib/i18n/notificationText";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";
import { ROLES, type RoomStatus } from "@/lib/domain";
import { SELL_BLOCKED } from "@/lib/stateMachine";
import { notifyFloorLeads } from "@/lib/rooms/notifyLeads";

/**
 * PATCH /api/workorders/[id] — engineering advances a work order:
 * OPEN → ACK → IN_PROGRESS → RESOLVED (forward-only, enforced server-side).
 */
const ORDER: WorkOrderStatus[] = ["OPEN", "ACK", "IN_PROGRESS", "RESOLVED"];

// F2 (M4): „Erledigt“ nur mit Notiz (was wurde gemacht) — Pflicht im Dialog und hier serverseitig
const Body = z.object({ status: WorkOrderStatusSchema, note: z.string().max(500).optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["engineering", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid work order status.", code: "INVALID_STATUS" }, { status: 400 });

  const wo = await prisma.workOrder.findUnique({ where: { id }, include: { defect: { include: { room: true } } } });
  if (!wo) return NextResponse.json({ error: "Work order not found.", code: "WORK_ORDER_NOT_FOUND" }, { status: 404 });

  const from = WorkOrderStatusSchema.parse(wo.status);
  const to = parsed.data.status;
  if (ORDER.indexOf(to) !== ORDER.indexOf(from) + 1) {
    return NextResponse.json({ error: `Illegal work order transition ${from} → ${to}.`, code: "ILLEGAL_TRANSITION" }, { status: 409 });
  }

  const resolutionNote = parsed.data.note?.trim() ?? "";
  if (to === "RESOLVED" && !resolutionNote) {
    return NextResponse.json({ error: "A note is required to resolve a work order.", code: "RESOLUTION_NOTE_REQUIRED" }, { status: 400 });
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
      ...(to === "RESOLVED" ? { resolutionNote } : {}),
    },
    include: {
      defect: {
        include: {
          room: {
            select: {
              id: true, number: true, status: true, floor: true,
              _count: { select: { notes: { where: { status: "OPEN", archivedAt: null } } } },
            },
          },
          reportedBy: { select: { name: true, role: true } },
        },
      },
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
    await endPauseOnChange("WORKORDER", id, auth.session.userId, wo.defect.roomId, wo.defect.room.number);
    // F2 (entschieden): Zimmer ist gesperrt und kein offener Auftrag mehr → dringend an Supervisor der Etage und DM
    // „Mangel behoben — wieder in Betrieb nehmen?“ (Antippen öffnet das Zimmerfenster mit dem Knopf „Wieder in Betrieb“).
    const stillOpen = await prisma.workOrder.count({ where: { defect: { roomId: wo.defect.roomId }, status: { not: "RESOLVED" } } });
    if (SELL_BLOCKED.has(wo.defect.room.status as RoomStatus) && stillOpen === 0) {
      await notifyFloorLeads({
        roomId: wo.defect.roomId, type: "OOO_READY", level: "warning", skipUserId: auth.session.userId, now,
        message: `${wo.defect.room.number}: Mangel behoben — wieder in Betrieb nehmen?`, key: "notify.oooReady", vars: { n: wo.defect.room.number },
        dedupeKey: `OOO_READY:${id}`,
      });
    }
    const notification = await prisma.notification.create({
      data: {
        type: "WORK_ORDER_RESOLVED",
        level: "info",
        targetRole: "supervisor",
        roomId: wo.defect.roomId,
        message: `Auftrag in Zimmer ${wo.defect.room.number} erledigt (${wo.defect.category}). Zimmer kann wieder gereinigt werden.`,
        ...keyed("notify.workOrderResolved", { n: wo.defect.room.number, categoryKey: `defectCategory.${wo.defect.category}` }),
        dedupeKey: `WORK_ORDER_RESOLVED:${id}`,
      },
    });
    broadcast("notification:new", { notification });

    // Mangel behoben → die heute zuständige Kraft und die Person, die ihn gemeldet hat (wenn es nicht dieselbe ist,
    // nicht der Gast-Systemzugang und nicht wer ihn gerade selbst behoben hat). Nur Zimmer + Etage.
    const room = wo.defect.room;
    const hk = await notifyHousekeeperOfRoomChange({ roomId: room.id, kind: "DEFECT_FIXED", actorId: auth.session.userId, now });
    const reporter = await prisma.user.findUnique({ where: { id: wo.defect.reportedById }, select: { id: true, role: true } });
    if (reporter && reporter.id !== auth.session.userId && reporter.id !== hk && (ROLES as readonly string[]).includes(reporter.role)) {
      const n2 = await prisma.notification.create({
        data: {
          type: "DEFECT_FIXED", level: "info", targetRole: reporter.role, targetUserId: reporter.id, roomId: room.id,
          message: `Zimmer ${room.number} (Etage ${room.floor}): Mangel behoben.`,
          ...keyed("notify.roomChange", { n: room.number, floor: room.floor, whatKey: "notify.changeDEFECT_FIXED" }),
          dedupeKey: `DEFECT_FIXED:${id}:${reporter.id}`,
        },
      });
      broadcast("notification:new", { notification: n2 });
    }
  }

  const { _count, ...defectRoom } = workOrder.defect.room;
  const workOrderWithCounts = {
    ...workOrder,
    defect: { ...workOrder.defect, room: { ...defectRoom, openNotesCount: _count.notes } },
  };
  broadcast("workorder:update", { workOrder: workOrderWithCounts });
  return NextResponse.json({ workOrder: workOrderWithCounts });
}
