import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { overrideCleaningType } from "@/lib/dayplan/merge";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room: z.string().regex(/^\d{3,4}$/),
  cleaningType: z.enum(["DEPARTURE", "SAME_DAY_TURN", "STAYOVER", "ARRIVAL"]),
}).strict();

/** POST /api/dayplan/override — Supervisor ändert die Reinigungsart eines Zimmers (wird protokolliert). */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  try {
    await overrideCleaningType(parsed.data.date, parsed.data.room, parsed.data.cleaningType, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Änderung fehlgeschlagen." }, { status: 409 });
  }
}
