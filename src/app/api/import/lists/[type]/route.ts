import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";
import { ImportTypeSchema } from "@/lib/domain";
import { berlinDate } from "@/lib/dayplan/time";
import { deleteAppliedList, ListNotFoundError, PlanConfirmedError } from "@/lib/import/deleteList";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * DELETE /api/import/lists/[type]?date=YYYY-MM-DD[&keepPlan=1] — löscht die eingelesene Liste des
 * Betriebstags (Standard: heute, Berlin). Danach fehlt sie im Gate wieder; ein neuer Import ersetzt sie.
 * Ist für den Tag ein Plan bestätigt, antwortet die Route mit 409 `planConfirmed`, bis `keepPlan=1` kommt.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const type = ImportTypeSchema.safeParse((await ctx.params).type);
  if (!type.success) return NextResponse.json({ error: "Unbekannte Liste." }, { status: 400 });
  const date = req.nextUrl.searchParams.get("date") ?? berlinDate(new Date());
  if (!DATE.test(date)) return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
  try {
    const r = await deleteAppliedList(type.data, date, auth.session.userId, { keepPlan: req.nextUrl.searchParams.get("keepPlan") === "1" });
    broadcast("import:deleted", { type: r.type, businessDate: r.businessDate }); // keine Gastdaten im Broadcast
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ListNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof PlanConfirmedError) return NextResponse.json({ error: e.message, planConfirmed: true }, { status: 409 });
    return NextResponse.json({ error: "Liste konnte nicht gelöscht werden. Bitte erneut versuchen." }, { status: 500 });
  }
}
