import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { decideSuggestion } from "@/lib/autoplan/service";

const Body = z.object({
  action: z.enum(["confirm", "reject"]),
  /** "Ändern": andere Ziele je Zimmer. */
  moves: z.array(z.object({ roomId: z.string().min(1), toId: z.string().min(1) }).strict()).optional(),
}).strict();

/** POST /api/redistribution/[id] — Bestätigen, Ablehnen oder Ändern. Erst nach Bestätigung ändert sich etwas bei den Housekeepern. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  try {
    return NextResponse.json(await decideSuggestion(id, parsed.data.action, auth.session, parsed.data.moves));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fehlgeschlagen." }, { status: 409 });
  }
}
