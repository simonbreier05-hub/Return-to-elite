import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { changeRoom } from "@/lib/rooms/roomChange";

/** POST /api/rooms/[id]/room-change — F3 Teil 4 (H9, B5 neu): Zimmerwechsel durch Front Office, Supervisor oder Duty Manager. */
const Body = z.object({ toRoomId: z.string().min(1), reason: z.string().trim().min(1).max(200) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Zielzimmer und Grund sind Pflicht.", code: "INVALID_INPUT" }, { status: 400 });
  const r = await changeRoom(auth.session, id, parsed.data.toRoomId, parsed.data.reason);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json(r);
}
