import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { berlinDate } from "@/lib/dayplan/time";
import { loadWorkData, setUsePlanningFlag, statsFor, usePlanningFlag } from "@/lib/workdata/load";

/**
 * GET /api/workdata?userId= — Arbeitsdaten einer Person (Supervisor/Duty Manager). Immer nur eine Person auf einmal:
 * keine Bestenliste, keine Vergleichsansicht. Ohne userId nur die Auswahlliste (Namen) und der Schalter.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const people = await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const usePlanning = await usePlanningFlag();
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ people, usePlanning });
  if (!people.some((p) => p.id === userId)) return NextResponse.json({ error: "Unbekannte Person." }, { status: 404 });
  const set = await loadWorkData(berlinDate(new Date()));
  return NextResponse.json({ people, usePlanning, since: set.since, minSamples: set.minSamples, defaults: set.defaults, stats: statsFor(set, userId) });
}

const Patch = z.object({ usePlanning: z.boolean() }).strict();

/** PATCH /api/workdata — Schalter „Messdaten in Planung verwenden". */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  await setUsePlanningFlag(parsed.data.usePlanning, auth.session.userId);
  return NextResponse.json({ ok: true });
}
