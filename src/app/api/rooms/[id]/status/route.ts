import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
import { BlockReasonSchema, RoomStatusSchema } from "@/lib/domain";
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";

/**
 * POST /api/rooms/[id]/status — change one room's status.
 *
 * The rules live in applyStatusChange so this route and the bulk release
 * cannot drift apart: role permissions (only supervisor/duty_manager may set
 * INSPECTED), legal transitions, required payload, audit trail, PMS push and
 * the realtime broadcast.
 */
const BodySchema = z.object({
  status: RoomStatusSchema,
  blockReason: BlockReasonSchema.optional(),
  note: z.string().max(1000).optional(),
  oooUntil: z.coerce.date().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await applyStatusChange(auth.session, id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ room: result.room });
}
