import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { DEFECT_CATEGORIES } from "@/lib/domain";

/**
 * "Mangel melden" — creates a Defect and its auto-routed WorkOrder. This is
 * the real work-order creation path (POST /api/rooms/[id]/defects nests the
 * WorkOrder create), extracted here so the staff route and the guest route
 * (/guest/[roomToken]/defect) share one implementation instead of two.
 */

export type DefectCategory = (typeof DEFECT_CATEGORIES)[number];

export type DefectReporter = { type: "staff"; userId: string } | { type: "guest"; label: string };

export interface ReportDefectInput {
  roomId: string;
  roomNumber: string;
  category: DefectCategory;
  note: string;
  photoPath?: string | null;
}

export async function reportDefect(input: ReportDefectInput, reporter: DefectReporter) {
  const defect = await prisma.defect.create({
    data: {
      roomId: input.roomId,
      category: input.category,
      note: input.note,
      photoPath: input.photoPath ?? null,
      reportedById: reporter.type === "staff" ? reporter.userId : null,
      guestSource: reporter.type === "guest" ? reporter.label : null,
      workOrder: { create: { status: "OPEN" } }, // auto-route to engineering
    },
    include: { workOrder: true, room: { select: { number: true } } },
  });

  await audit({
    action: "DEFECT_REPORTED",
    userId: reporter.type === "staff" ? reporter.userId : null,
    roomId: input.roomId,
    meta: {
      category: input.category,
      note: input.note,
      photoPath: input.photoPath ?? null,
      workOrderId: defect.workOrder?.id,
      ...(reporter.type === "guest" ? { guestSource: reporter.label } : {}),
    },
  });

  const notification = await prisma.notification.create({
    data: {
      type: "WORK_ORDER",
      level: "warning",
      targetRole: "engineering",
      roomId: input.roomId,
      message: `New work order: room ${input.roomNumber} — ${input.category}: ${input.note.slice(0, 120)}`,
      dedupeKey: `WORK_ORDER:${defect.id}`,
    },
  });
  broadcast("notification:new", { notification });
  broadcast("workorder:update", { workOrder: { ...defect.workOrder, defect: { ...defect, workOrder: undefined } } });

  return defect;
}
