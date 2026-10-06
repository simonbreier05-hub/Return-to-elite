import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { setAbsent } from "@/lib/autoplan/service";

const Body = z.object({ absent: z.boolean() }).strict();

/** POST /api/housekeepers/[id]/absent — ein Tap: heute abwesend (oder wieder da). Erzeugt ggf. einen Umverteilungsvorschlag. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  try {
    return NextResponse.json(await setAbsent(id, parsed.data.absent, auth.session.userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fehlgeschlagen." }, { status: 404 });
  }
}
