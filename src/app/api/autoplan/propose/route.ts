import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { proposeForDate } from "@/lib/autoplan/service";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attendantIds: z.array(z.string().min(1)).optional(),
}).strict();

/** POST /api/autoplan/propose — "Plan vorschlagen": berechnet und speichert einen Entwurf. Ändert nichts am Board. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  const date = parsed.data.date ?? (await latestPlanDate());
  if (!date) return NextResponse.json({ error: "Noch kein Tagesplan. Bitte zuerst importieren und den Tagesplan berechnen." }, { status: 409 });
  try {
    const r = await proposeForDate(date, auth.session.userId, parsed.data.attendantIds);
    return NextResponse.json({ date, proposalId: r.proposalId, ...r.payload });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Vorschlag fehlgeschlagen." }, { status: 409 });
  }
}
