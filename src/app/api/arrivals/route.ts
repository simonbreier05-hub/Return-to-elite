import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const arrivals = await prisma.arrival.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: [{ eta: "asc" }],
    include: { room: { select: { id: true, number: true, status: true, floor: true, type: true } } },
  });
  const readyForArrival = arrivals.filter((a) => a.status === "EXPECTED" && a.room.status === "INSPECTED").length;
  return NextResponse.json({ arrivals, readyForArrival });
}

const CreateSchema = z.object({
  roomNumber: z.string().trim().min(1),
  guestName: z.string().trim().min(1).max(200),
  eta: z.coerce.date().optional(),
  vip: z.boolean().optional().default(false),
  earlyCheckIn: z.boolean().optional().default(false),
  neededNow: z.boolean().optional().default(false),
});

/** POST /api/arrivals — front office (and duty manager) only. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["front_office"]);
  if (!auth.ok) return auth.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid arrival payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { number: parsed.data.roomNumber } });
  if (!room) return NextResponse.json({ error: `Room ${parsed.data.roomNumber} not found.` }, { status: 404 });

  const arrival = await prisma.arrival.create({
    data: {
      roomId: room.id,
      guestName: parsed.data.guestName,
      eta: parsed.data.eta,
      vip: parsed.data.vip,
      earlyCheckIn: parsed.data.earlyCheckIn,
      neededNow: parsed.data.neededNow,
      createdById: auth.session.userId,
    },
    include: { room: { select: { id: true, number: true, status: true } } },
  });
  await audit({ action: "ARRIVAL_CREATED", userId: auth.session.userId, roomId: room.id, meta: { arrivalId: arrival.id } });
  broadcast("arrival:update", { arrival });
  return NextResponse.json({ arrival }, { status: 201 });
}
