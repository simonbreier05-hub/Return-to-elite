import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

/** GET /api/audit — status-change audit trail (supervisor & duty_manager). */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const roomId = req.nextUrl.searchParams.get("roomId") ?? undefined;
  const entries = await prisma.auditLog.findMany({
    where: roomId ? { roomId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { name: true, role: true } },
      room: { select: { number: true } },
    },
  });
  return NextResponse.json({ entries });
}
