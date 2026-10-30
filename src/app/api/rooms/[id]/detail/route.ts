import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getRoomDetail } from "@/lib/rooms/roomDetail";

/** GET /api/rooms/[id]/detail — alles zum Zimmer für das Detail-Modal (Zimmer-Id oder -Nummer). Nur Supervisor/Duty Manager. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const detail = await getRoomDetail(id, auth.session.role, auth.session);
  if (!detail) return NextResponse.json({ error: "Zimmer nicht gefunden." }, { status: 404 });
  return NextResponse.json({ room: detail });
}
