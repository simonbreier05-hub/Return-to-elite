import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { DefectCategory } from "@/lib/domain";

/**
 * Create a defect report: Defect + auto-routed WorkOrder (OPEN) + the
 * engineering notification, with the audit entry and realtime broadcasts
 * that go with it.
 *
 * Pulled out of the staff-facing route (POST /api/rooms/[id]/defects) so the
 * guest-facing report route (POST /api/guest/room305/defect) can create the
 * exact same records instead of a parallel, guest-only defect flow. The two
 * routes differ only in who is allowed to call them and who `reportedById`
 * resolves to — everything a defect *becomes* once reported is identical.
 */
export async function reportDefect(input: {
  room: { id: string; number: string };
  category: DefectCategory;
  note: string;
  photoPath: string | null;
  reportedById: string;
}) {
  const { room, category, note, photoPath, reportedById } = input;

  const defect = await prisma.defect.create({
    data: {
      roomId: room.id,
      category,
      note,
      photoPath,
      reportedById,
      workOrder: { create: { status: "OPEN" } }, // auto-route to engineering
    },
    include: { workOrder: true, room: { select: { number: true } } },
  });

  await audit({
    action: "DEFECT_REPORTED",
    userId: reportedById,
    roomId: room.id,
    meta: { category, note, photoPath, workOrderId: defect.workOrder?.id },
  });

  const notification = await prisma.notification.create({
    data: {
      type: "WORK_ORDER",
      level: "warning",
      targetRole: "engineering",
      roomId: room.id,
      message: `New work order: room ${room.number} — ${category}: ${note.slice(0, 120)}`,
      dedupeKey: `WORK_ORDER:${defect.id}`,
    },
  });
  broadcast("notification:new", { notification });
  broadcast("workorder:update", { workOrder: { ...defect.workOrder, defect: { ...defect, workOrder: undefined } } });

  return defect;
}
