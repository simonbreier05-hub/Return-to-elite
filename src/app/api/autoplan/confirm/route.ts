import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { confirmProposal } from "@/lib/autoplan/service";

const Body = z.object({
  proposalId: z.string().min(1),
  assignment: z.record(z.string(), z.string().nullable()),
}).strict();

/** POST /api/autoplan/confirm — Entwurf (ggf. mit Handänderungen) bestätigen; erst jetzt live bei den Housekeepern. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  try {
    return NextResponse.json(await confirmProposal(parsed.data.proposalId, parsed.data.assignment, auth.session));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bestätigen fehlgeschlagen." }, { status: 409 });
  }
}
