import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { berlinDate } from "@/lib/dayplan/time";
import { deletePattern, getLearningState, listPatterns, setLearningEnabled, setPatternActive } from "@/lib/learning/store";

/**
 * GET /api/learning — „Gelernte Regeln": alle Muster mit Beschreibung, Anzahl Beobachtungen, letztem Datum, Ein/Aus.
 * Nur Supervisor/Duty Manager (Namen der betroffenen Personen erscheinen hier, nie Stufe/Typ).
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const today = berlinDate(new Date());
  const [state, patterns] = await Promise.all([getLearningState(), listPatterns(today)]);
  const ids = [...new Set(patterns.flatMap((p) => [p.personId, p.target]).filter((x): x is string => !!x))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  return NextResponse.json({
    enabled: state.enabled,
    patterns: patterns.map((p) => ({ ...p, personName: p.personId ? name.get(p.personId) ?? null : null, targetName: p.target ? name.get(p.target) ?? null : null })),
  });
}

const Patch = z.union([
  z.object({ enabled: z.boolean() }).strict(),
  z.object({ key: z.string().min(3).max(200), active: z.boolean() }).strict(),
]);

/** PATCH /api/learning — Gesamtschalter oder einzelnes Muster ein/aus. */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  if ("enabled" in parsed.data) await setLearningEnabled(parsed.data.enabled, auth.session.userId);
  else await setPatternActive(parsed.data.key, parsed.data.active, auth.session.userId);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/learning?key= — Muster löschen (lernt danach nur aus neuen Beobachtungen). */
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Muster fehlt." }, { status: 400 });
  await deletePattern(key, berlinDate(new Date()), auth.session.userId);
  return NextResponse.json({ ok: true });
}
