import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
import { BlockReasonSchema, RoomStatusSchema } from "@/lib/domain";
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";

/**
 * POST /api/rooms/bulk-status — apply one status to several rooms.
 *
 * Built for the release queue: sixteen inspected rooms should be one action,
 * not sixteen taps. Every room still goes through applyStatusChange
 * individually, so permissions, legal transitions, the audit trail and the PMS
 * push are identical to doing them one at a time.
 *
 * Partial success is normal and is reported per room rather than failing the
 * whole batch — if one room was changed by someone else in the meantime, the
 * other fifteen should still go through.
 */
const Body = z.object({
  roomIds: z.array(z.string().min(1)).min(1).max(200),
  status: RoomStatusSchema,
  blockReason: BlockReasonSchema.optional(),
  note: z.string().max(1000).optional(),
  oooUntil: z.coerce.date().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }
  const { roomIds, ...input } = parsed.data;

  const succeeded: { roomId: string; number: string }[] = [];
  const failed: { roomId: string; error: string; status: number }[] = [];

  // Sequential on purpose: each change writes an audit row and broadcasts, and
  // the batches here are small. Predictable beats fast.
  for (const roomId of [...new Set(roomIds)]) {
    const result = await applyStatusChange(auth.session, roomId, input);
    if (result.ok) succeeded.push({ roomId, number: result.room.number });
    else failed.push({ roomId, error: result.error, status: result.status });
  }

  // A batch where nothing worked is almost always a permission problem; give
  // the caller that status rather than a misleading 200.
  const httpStatus = succeeded.length === 0 && failed.length > 0 ? (failed[0].status ?? 400) : 200;

  return NextResponse.json(
    { succeeded, failed, changed: succeeded.length, rejected: failed.length },
    { status: httpStatus }
  );
}
