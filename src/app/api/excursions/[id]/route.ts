import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * F7 (M24, Annahme B11): Ausflug bearbeiten (Zeiten, Notiz) und löschen — nur der eigene Eintrag des Concierge
 * (der Duty Manager darf jeden). Jede Änderung steht im Logbuch. Gastname wird nie ins Logbuch geschrieben.
 */
const Patch = z
  .object({ startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), note: z.string().trim().max(500).nullable().optional() })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, { message: "endsAt must be after startsAt" });

async function ownExcursion(id: string, session: { userId: string; role: string }) {
  const ex = await prisma.excursion.findUnique({ where: { id } });
  if (!ex) return { error: NextResponse.json({ error: "Ausflug nicht gefunden.", code: "NOT_FOUND" }, { status: 404 }) };
  if (session.role !== "duty_manager" && ex.createdById !== session.userId) {
    return { error: NextResponse.json({ error: "Nur der eigene Eintrag kann geändert werden.", code: "NOT_OWN_ENTRY" }, { status: 403 }) };
  }
  return { ex };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["concierge", "duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const own = await ownExcursion(id, auth.session);
  if (own.error) return own.error;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben.", code: "INVALID_INPUT" }, { status: 400 });
  const startsAt = parsed.data.startsAt ?? own.ex.startsAt;
  const endsAt = parsed.data.endsAt ?? own.ex.endsAt;
  if (endsAt <= startsAt) return NextResponse.json({ error: "Ende muss nach dem Beginn liegen.", code: "INVALID_INPUT" }, { status: 400 });
  const excursion = await prisma.excursion.update({ where: { id }, data: { startsAt, endsAt, ...(parsed.data.note !== undefined ? { note: parsed.data.note || null } : {}) } });
  await audit({ action: "EXCURSION_UPDATED", userId: auth.session.userId, roomId: own.ex.roomId, meta: { excursionId: id } });
  broadcast("excursion:update", { excursion });
  return NextResponse.json({ excursion });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["concierge", "duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const own = await ownExcursion(id, auth.session);
  if (own.error) return own.error;
  await prisma.excursion.delete({ where: { id } });
  await audit({ action: "EXCURSION_DELETED", userId: auth.session.userId, roomId: own.ex.roomId, meta: { excursionId: id } });
  broadcast("excursion:update", { deletedId: id });
  return NextResponse.json({ ok: true });
}
