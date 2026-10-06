import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { mergeDay } from "@/lib/dayplan/merge";
import { checkRedistribution } from "@/lib/autoplan/service";
import { latestPlanDate } from "@/lib/dayplan/latest";

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();

/** POST /api/dayplan/merge — Aufenthalte, Traces und Tagesplan aus den übernommenen Listen berechnen. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
  const date = parsed.data.date ?? (await latestPlanDate());
  if (!date) return NextResponse.json({ error: "Noch keine Departures übernommen." }, { status: 409 });
  try {
    const result = await mergeDay(date, auth.session.userId);
    // Neuer Turn / geänderte Reinigungsart: Umverteilung prüfen (Fehler hier dürfen den Tagesplan nicht kippen).
    await checkRedistribution(date).catch(() => null);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Berechnung fehlgeschlagen." }, { status: 409 });
  }
}
