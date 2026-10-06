import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";
import { applyBatch } from "@/lib/import/store";
import { prisma } from "@/lib/db";

/** POST /api/import/batches/[id]/apply — übernimmt die Vorschau (ersetzt den Stand desselben Typs + Tags). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    await applyBatch(id, auth.session.userId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Übernehmen fehlgeschlagen." }, { status: 409 });
  }
  const b = await prisma.importBatch.findUnique({ where: { id }, select: { type: true, businessDate: true } });
  broadcast("import:applied", { type: b?.type, businessDate: b?.businessDate }); // keine Gastdaten im Broadcast
  return NextResponse.json({ ok: true });
}
