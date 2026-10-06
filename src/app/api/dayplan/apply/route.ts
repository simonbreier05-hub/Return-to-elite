import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { applyDayPlanToBoard } from "@/lib/dayplan/merge";

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();

/** POST /api/dayplan/apply — Tagesplan auf das Board übernehmen (Zuteilungen bleiben unberührt). */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
  try {
    return NextResponse.json(await applyDayPlanToBoard(parsed.data.date, auth.session.userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Übernehmen fehlgeschlagen." }, { status: 409 });
  }
}
