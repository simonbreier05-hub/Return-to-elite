import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

/**
 * GET /api/guest-requests — supervisor's view of every DND/cleaning/contact
 * request raised from the guest screen (Prompt G2 Teil 4: "Supervisor kann
 * Gästeanfragen einsehen"). Defaults to still-open ones (RECEIVED/IN_PROGRESS);
 * pass ?all=1 to include DONE/CANCELLED too (e.g. for a shift-end review).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const includeAll = req.nextUrl.searchParams.get("all") === "1";
  const guestRequests = await prisma.guestRequest.findMany({
    where: includeAll ? {} : { status: { in: ["RECEIVED", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      room: { select: { id: true, number: true, floor: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ guestRequests });
}
