import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

const PatchSchema = z.object({
  eta: z.coerce.date().nullable().optional(),
  vip: z.boolean().optional(),
  earlyCheckIn: z.boolean().optional(),
  neededNow: z.boolean().optional(),
  status: z.enum(["EXPECTED", "CHECKED_IN", "CANCELLED"]).optional(),
});

/** PATCH /api/arrivals/[id] — front office edits ETA/flags/check-in. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["front_office"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const existing = await prisma.arrival.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Arrival not found." }, { status: 404 });

  const arrival = await prisma.arrival.update({
    where: { id },
    data: parsed.data,
    include: { room: { select: { id: true, number: true, status: true } } },
  });
  await audit({ action: "ARRIVAL_UPDATED", userId: auth.session.userId, roomId: arrival.roomId, meta: parsed.data });
  broadcast("arrival:update", { arrival });
  return NextResponse.json({ arrival });
}
