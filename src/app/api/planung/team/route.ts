import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { getTeamState, saveTeam } from "@/lib/planung/teamData";

const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  date: Date_,
  hk: z.array(z.string().min(1)).max(200),
  sup: z.array(z.string().min(1)).max(50),
  hm: z.array(z.string().min(1)).max(50),
}).strict();

/**
 * GET /api/planung/team?date= — Team-Auswahl, Bedarf und Stammdaten für „Team"/„Etagen".
 * Enthält Typ/Stufe der Housekeeper (Beschäftigtendaten): nur Supervisor und Duty Manager.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date") ?? (await latestPlanDate());
  if (!date || !Date_.safeParse(date).success) return NextResponse.json({ error: "Noch kein Tagesplan. Bitte zuerst die Listen einlesen." }, { status: 409 });
  return NextResponse.json(await getTeamState(date));
}

/** PUT /api/planung/team — „heute anwesend" speichern (Roster + Auswahl für morgen). */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  const { date, ...sel } = parsed.data;
  if (sel.hk.length < 1 || sel.sup.length < 1) return NextResponse.json({ error: "Mindestens ein Housekeeper und ein Supervisor." }, { status: 400 });
  try {
    await saveTeam(date, sel, auth.session.userId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Speichern fehlgeschlagen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
