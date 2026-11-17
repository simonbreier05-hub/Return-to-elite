import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * PATCH /api/rooms/[id]/ooo — F2 (entschieden): Der Duty Manager passt Grund und Ende einer Sperre jederzeit an (Logbuch).
 * Ein Altbestand „Nicht im Service“ wird dabei zu „Außer Betrieb“. Wieder in Betrieb nehmen geht über den Status (DIRTY).
 */
const Body = z.object({ reason: z.string().trim().min(1).max(200).optional(), until: z.coerce.date().optional() })
  .refine((b) => b.reason !== undefined || b.until !== undefined, { message: "reason or until required" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload.", code: "INVALID_INPUT" }, { status: 400 });
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Room not found.", code: "ROOM_NOT_FOUND" }, { status: 404 });
  if (room.status !== "OUT_OF_ORDER" && room.status !== "OUT_OF_SERVICE") return NextResponse.json({ error: "Room is not blocked.", code: "NOT_BLOCKED" }, { status: 409 });
  const updated = await prisma.room.update({
    where: { id },
    data: {
      status: "OUT_OF_ORDER",
      ...(parsed.data.reason !== undefined ? { oooReason: parsed.data.reason } : {}),
      ...(parsed.data.until !== undefined ? { oooUntil: parsed.data.until } : {}),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  await audit({ action: "OOO_UPDATED", userId: auth.session.userId, roomId: id, fromStatus: room.status, toStatus: "OUT_OF_ORDER",
    meta: { oooReason: parsed.data.reason, until: parsed.data.until, before: { oooReason: room.oooReason, until: room.oooUntil } } });
  broadcast("room:update", { room: updated });
  return NextResponse.json({ room: updated });
}
