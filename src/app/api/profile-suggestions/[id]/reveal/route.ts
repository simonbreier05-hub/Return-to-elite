import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/**
 * POST /api/profile-suggestions/[id]/reveal — F8 Notfallzugriff (Entscheidung Simon 19.11.2026): Nach 24 Uhr am Abreisetag
 * ist der Gastname in der Kachel ausgeblendet; der Duty Manager kann ihn im Notfall einblenden, bis er am Folgetag um 12 Uhr
 * endgültig gelöscht wird. Jeder Zugriff steht im Logbuch (wer, wann, welcher Vorschlag — ohne Namen). Nur Duty Manager.
 * Ist der Name schon gelöscht: 410 NAME_PURGED.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const s = await prisma.profileSuggestion.findUnique({ where: { id }, select: { guestSalutation: true, guestTitle: true, guestLastName: true } });
  if (!s) return NextResponse.json({ error: "Vorschlag nicht gefunden.", code: "NOT_FOUND" }, { status: 404 });
  const guest = [s.guestSalutation, s.guestTitle, s.guestLastName].filter(Boolean).join(" ");
  if (!guest) return NextResponse.json({ error: "Der Name ist bereits gelöscht — bitte in Opera nachschlagen.", code: "NAME_PURGED" }, { status: 410 });
  await audit({ action: "PROFILE_NAME_REVEALED", userId: auth.session.userId, meta: { suggestionId: id } });
  return NextResponse.json({ guest });
}
