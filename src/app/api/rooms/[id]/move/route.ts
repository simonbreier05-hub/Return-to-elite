import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { moveRoomBetweenAttendants } from "@/lib/rooms/moveRoomBetweenAttendants";

/**
 * POST /api/rooms/[id]/move — supervisor moves an already-assigned room from
 * one attendant to another (one is faster than the other today), keeping
 * both routes tidy. See moveRoomBetweenAttendants for the routeOrder logic;
 * use /api/rooms/[id]/assign instead for assigning a room that has no
 * attendant yet.
 */
const Body = z.object({ toAttendantId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "toAttendantId required." }, { status: 400 });

  const result = await moveRoomBetweenAttendants(auth.session, id, parsed.data.toAttendantId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ room: result.room });
}
