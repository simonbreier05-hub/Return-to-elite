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
    // Eigene Meldungen (Vorschau vorbei, kritische Befunde) gehen durch; Datenbankfehler nie roh an die Oberfläche.
    const db = e instanceof Error && e.constructor.name.startsWith("PrismaClient");
    if (db || !(e instanceof Error)) return NextResponse.json({ error: "Liste konnte nicht übernommen werden (Datenbank antwortet nicht). Bitte erneut versuchen.", code: "TRY_AGAIN" }, { status: 503 });
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
  const b = await prisma.importBatch.findUnique({ where: { id }, select: { type: true, businessDate: true } });
  broadcast("import:applied", { type: b?.type, businessDate: b?.businessDate }); // keine Gastdaten im Broadcast
  return NextResponse.json({ ok: true });
}
