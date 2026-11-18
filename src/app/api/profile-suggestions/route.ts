import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

/**
 * GET /api/profile-suggestions — F8: offene Opera-Profil-Vorschläge. Nur Duty Manager (403 für alle anderen, auch
 * Supervisor). Kein Live-Ereignis mit Gastnamen — die DM-Kachel lädt über diese geschützte API.
 */
export async function GET() {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.profileSuggestion.findMany({ where: { status: "OPEN" }, orderBy: { departure: "desc" } });
  return NextResponse.json({
    suggestions: rows.map((r) => ({
      id: r.id, roomNumber: r.roomNumber, departure: r.departure.toISOString(),
      guest: [r.guestSalutation, r.guestTitle, r.guestLastName].filter(Boolean).join(" ") || null,
      items: JSON.parse(r.items),
    })),
  });
}
