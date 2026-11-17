import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { loadBlockedRooms } from "@/lib/rooms/blockedRooms";

/** GET /api/rooms/blocked — F2: Kachel „Gesperrte Zimmer“ (Duty Manager, Supervisor, Front Office, Technik). Ganzes Haus. */
export async function GET() {
  const auth = await requireRole(["duty_manager", "supervisor", "front_office", "engineering"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ rooms: await loadBlockedRooms() });
}
