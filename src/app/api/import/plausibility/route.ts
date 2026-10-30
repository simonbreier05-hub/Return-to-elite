import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { berlinToday } from "@/lib/import/businessDay";
import { acknowledgePlausibility, getPlausibility } from "@/lib/import/plausibilityData";

/** GET /api/import/plausibility — Abweichungen der Listen untereinander und zum Forecast (Betriebstag). Nie blockierend. */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getPlausibility(berlinToday()));
}

const Body = z.object({ signature: z.string().min(1).max(80) }).strict();

/** POST /api/import/plausibility — „Gesehen, trotzdem planen“: bestätigt genau diesen Stand der Befunde (Logbuch). */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const ok = await acknowledgePlausibility(berlinToday(), parsed.data.signature, auth.session.userId);
  if (!ok) return NextResponse.json({ error: "Die Befunde haben sich geändert — bitte neu ansehen." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
