import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

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
  const withNoteCounts = workOrders.map((wo) => {
    const { _count, ...room } = wo.defect.room;
    return { ...wo, defect: { ...wo.defect, room: { ...room, openNotesCount: _count.notes } } };
  });
  return NextResponse.json({ workOrders: withNoteCounts });
}
