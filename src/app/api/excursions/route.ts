import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const excursions = await prisma.excursion.findMany({
    where: { endsAt: { gte: new Date(Date.now() - 12 * 60 * 60_000) } },
    orderBy: { startsAt: "asc" },
    include: { room: { select: { id: true, number: true, status: true } } },
  });
  return NextResponse.json({ excursions });
}

const CreateSchema = z
  .object({
    roomNumber: z.string().trim().min(1),
    guestName: z.string().trim().max(200).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.endsAt > d.startsAt, { message: "endsAt must be after startsAt" });

/** POST /api/excursions — concierge logs a guest out-of-house window. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["concierge", "front_office"]);
  if (!auth.ok) return auth.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid excursion payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { number: parsed.data.roomNumber } });
  if (!room) return NextResponse.json({ error: `Room ${parsed.data.roomNumber} not found.` }, { status: 404 });

  const excursion = await prisma.excursion.create({
    data: {
      roomId: room.id,
      guestName: parsed.data.guestName,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      note: parsed.data.note,
      createdById: auth.session.userId,
    },
    include: { room: { select: { id: true, number: true, status: true } } },
  });
  await audit({ action: "EXCURSION_LOGGED", userId: auth.session.userId, roomId: room.id, meta: { excursionId: excursion.id } });
  broadcast("excursion:update", { excursion });
  return NextResponse.json({ excursion }, { status: 201 });
}
