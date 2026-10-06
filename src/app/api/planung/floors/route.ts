import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { saveFloors } from "@/lib/planung/teamData";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  floors: z.object({ "1": z.string().min(1), "2": z.string().min(1), "3": z.string().min(1), "4": z.string().min(1), "5": z.string().min(1) }).strict(),
}).strict();

/** PUT /api/planung/floors — Etagenzuweisung für heute in die bestehende Zuweisung (`User.assignedFloors`) schreiben. */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Jede Etage braucht einen Supervisor." }, { status: 400 });
  const f = parsed.data.floors;
  try {
    await saveFloors(parsed.data.date, { 1: f["1"], 2: f["2"], 3: f["3"], 4: f["4"], 5: f["5"] }, auth.session.userId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Speichern fehlgeschlagen." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
