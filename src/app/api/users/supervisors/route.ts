import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseAssignedFloors } from "@/lib/floors";

/** GET /api/users/supervisors — duty-manager-only: the supervisor roster, for floor assignment. */
export async function GET() {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;

  const supervisors = await prisma.user.findMany({
    where: { role: "supervisor" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, assignedFloors: true },
  });

  return NextResponse.json({
    supervisors: supervisors.map((s) => ({ ...s, assignedFloors: parseAssignedFloors(s.assignedFloors) })),
  });
}
