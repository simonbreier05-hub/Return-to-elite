import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { canSeeDefectPhotos } from "@/lib/rooms/defectPhotoAccess";
import { activePauses } from "@/lib/work/pauseData";

/** GET /api/workorders — engineering queue (visible to all roles). */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const workOrders = await prisma.workOrder.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      defect: {
        include: {
          room: {
            select: {
              id: true, number: true, status: true, floor: true,
              _count: { select: { notes: { where: { status: "OPEN" } } } },
            },
          },
          reportedBy: { select: { name: true, role: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  const pauses = await activePauses("WORKORDER", workOrders.filter((wo) => wo.status !== "RESOLVED").map((wo) => wo.id));
  const withNoteCounts = workOrders.map((wo) => {
    const { _count, ...room } = wo.defect.room;
    return { ...wo, pause: pauses.get(wo.id) ?? null, defect: { ...wo.defect, photoPath: canSeeDefectPhotos(auth.session.role) ? wo.defect.photoPath : null, room: { ...room, openNotesCount: _count.notes } } }; // Betrieb L2 (Punkt 8)
  });
  return NextResponse.json({ workOrders: withNoteCounts });
}
