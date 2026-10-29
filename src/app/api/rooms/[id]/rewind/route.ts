import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { rewindRoomStatus } from "@/lib/rooms/rewindData";

/**
 * POST /api/rooms/[id]/rewind — Housekeeper nimmt den eigenen letzten Statusschritt an einem eigenen Zimmer zurück
 * (eine Stufe, innerhalb von Setting statusRewindMinutes; Regeln in src/lib/rooms/rewind.ts). Supervisor/Duty Manager setzen
 * Status ohnehin direkt und brauchen das nicht.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["room_attendant"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await rewindRoomStatus(auth.session, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ room: result.room });
}
