import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { saveFloors } from "@/lib/planung/teamData";
import { getFloorTeamState, saveFloorTeam } from "@/lib/planung/floorTeamData";
import { latestPlanDate } from "@/lib/dayplan/latest";

const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Alte Form (nur Supervisor je Etage) — bleibt für bestehende Aufrufer. */
const Legacy = z.object({
  date: Date_,
  floors: z.object({ "1": z.string().min(1), "2": z.string().min(1), "3": z.string().min(1), "4": z.string().min(1), "5": z.string().min(1) }).strict(),
}).strict();
/** Neue Form (H1): Person → Etagen, für Supervisor, Housekeeper und Hausmann. */
const Team = z.object({
  date: Date_,
  assign: z.record(z.string().min(1), z.array(z.number().int().min(1).max(5)).max(5)),
}).strict();

/**
 * GET /api/planung/floors?date= — Etagenzuweisung für das ganze Team: Personen, Etagen-Kennzahlen,
 * heutiger Stand und Vorschläge aus den tatsächlichen Einsätzen. Enthält Stufe/Typ: nur Supervisor/Duty Manager.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const date = req.nextUrl.searchParams.get("date") ?? (await latestPlanDate());
  if (!date || !Date_.safeParse(date).success) return NextResponse.json({ error: "Noch kein Tagesplan. Bitte zuerst die Listen einlesen." }, { status: 409 });
  return NextResponse.json(await getFloorTeamState(date));
}

/** PUT /api/planung/floors — Etagenzuweisung speichern (jede Etage braucht einen gewählten Supervisor). */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const raw = await req.json().catch(() => null);
  const team = Team.safeParse(raw);
  try {
    if (team.success) {
      const r = await saveFloorTeam(team.data.date, team.data.assign, auth.session.userId);
      return NextResponse.json({ ok: true, ...r });
    }
    const legacy = Legacy.safeParse(raw);
    if (!legacy.success) return NextResponse.json({ error: "Jede Etage braucht einen Supervisor." }, { status: 400 });
    const f = legacy.data.floors;
    await saveFloors(legacy.data.date, { 1: f["1"], 2: f["2"], 3: f["3"], 4: f["4"], 5: f["5"] }, auth.session.userId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Speichern fehlgeschlagen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
