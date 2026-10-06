import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { rejectBatch } from "@/lib/import/store";

/** POST /api/import/batches/[id]/reject — verwirft die Vorschau. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  await rejectBatch(id, auth.session.userId);
  return NextResponse.json({ ok: true });
}
