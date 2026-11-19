import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { eligibleTargets } from "@/lib/rooms/roomChange";

/** GET /api/rooms/room-change-targets — F3 Teil 4: mögliche Zielzimmer (frei, geprüft, nicht gesperrt, ohne Anreise heute). */
export async function GET() {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ rooms: await eligibleTargets() });
}
