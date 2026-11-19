import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { profileNameVisibleUntil } from "@/lib/guest/profileSuggestion";

/**
 * GET /api/profile-suggestions — F8: offene Opera-Profil-Vorschläge. Nur Duty Manager (403 für alle anderen, auch
 * Supervisor). Kein Live-Ereignis mit Gastnamen — die DM-Kachel lädt über diese geschützte API.
 */
export async function GET() {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.profileSuggestion.findMany({ where: { status: "OPEN" }, orderBy: { departure: "desc" } });
  const now = new Date();
  return NextResponse.json({
    suggestions: rows.map((r) => {
      const name = [r.guestSalutation, r.guestTitle, r.guestLastName].filter(Boolean).join(" ") || null;
      // Simon 19.11.: Name bis 24 Uhr am Abreisetag (danach löscht ihn der Löschtakt; bis dahin hier schon ausgeblendet)
      const visible = now < profileNameVisibleUntil(r.departure);
      return {
        id: r.id, roomNumber: r.roomNumber, departure: r.departure.toISOString(),
        guest: visible ? name : null,
        items: JSON.parse(r.items),
      };
    }),
  });
}
