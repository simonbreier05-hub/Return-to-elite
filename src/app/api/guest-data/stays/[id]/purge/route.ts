import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { purgeStay } from "@/lib/guestDataPurge";

/** POST /api/guest-data/stays/[id]/purge — Einzellöschung für Auskunfts-/Löschwünsche (Duty Manager). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ counts: await purgeStay(id, auth.session.userId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Löschen fehlgeschlagen." }, { status: 409 });
  }
}
