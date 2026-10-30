import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";
import { ImportTypeSchema } from "@/lib/domain";
import { berlinToday } from "@/lib/import/businessDay";
import { deleteAppliedList, ListNotFoundError, PlanConfirmedError } from "@/lib/import/deleteList";

/**
 * DELETE /api/import/lists/[type][?keepPlan=1] — löscht die eingelesene Liste (alle übernommenen Stände des Typs).
 * Danach fehlt sie im Gate wieder; ein neuer Import ersetzt sie. Ist für den Betriebstag ein Plan bestätigt,
 * antwortet die Route mit 409 `planConfirmed`, bis `keepPlan=1` kommt (der Plan bleibt bestehen).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const type = ImportTypeSchema.safeParse((await ctx.params).type);
  if (!type.success) return NextResponse.json({ error: "Unbekannte Liste." }, { status: 400 });
  try {
    const r = await deleteAppliedList(type.data, berlinToday(), auth.session.userId, { keepPlan: req.nextUrl.searchParams.get("keepPlan") === "1" });
    broadcast("import:deleted", { type: r.type, businessDate: r.businessDate }); // keine Gastdaten im Broadcast
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ListNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof PlanConfirmedError) return NextResponse.json({ error: e.message, planConfirmed: true }, { status: 409 });
    return NextResponse.json({ error: "Liste konnte nicht gelöscht werden. Bitte erneut versuchen." }, { status: 500 });
  }
}
