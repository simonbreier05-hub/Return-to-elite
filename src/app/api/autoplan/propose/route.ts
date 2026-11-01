import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { listBlockersNow } from "@/lib/import/store";
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
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben.", code: "INVALID_INPUT" }, { status: 400 });
  const { missing, stale } = await listBlockersNow();
  if (missing.length) return NextResponse.json({ error: `Es fehlen noch Listen: ${missing.join(", ")}.`, code: "LISTS_MISSING", missing }, { status: 409 });
  if (stale.length) return NextResponse.json({ error: `Veraltete Listen ohne Bestätigung: ${stale.map((s) => `${s.type} (${s.businessDate})`).join(", ")}.`, code: "LISTS_STALE", stale }, { status: 409 });
  const date = parsed.data.date ?? (await latestPlanDate());
  if (!date) return NextResponse.json({ error: "Noch kein Tagesplan. Bitte zuerst importieren und den Tagesplan berechnen.", code: "NO_DAY_PLAN" }, { status: 409 });
  try {
    const r = await proposeForDate(date, auth.session.userId, parsed.data.attendantIds);
    return NextResponse.json({ date, proposalId: r.proposalId, ...r.payload });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Vorschlag fehlgeschlagen." }, { status: 409 });
  }
}
