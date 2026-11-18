import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { ProfileItem } from "@/lib/guest/profileSuggestion";

/**
 * PATCH /api/profile-suggestions/[id] — F8: einen Punkt „in Opera übernommen“ (TAKEN) oder „verwerfen“ (DISCARDED),
 * bzw. `{ all: true }` = „alle erledigt“. Sind alle Punkte erledigt, wird der Vorschlag gelöscht. Nur Duty Manager.
 * Logbuch nur mit Ids, nie mit Gastnamen.
 */
const Body = z.union([
  z.object({ index: z.number().int().min(0), status: z.enum(["TAKEN", "DISCARDED"]) }),
  z.object({ all: z.literal(true) }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben.", code: "INVALID_INPUT" }, { status: 400 });
  const s = await prisma.profileSuggestion.findUnique({ where: { id } });
  if (!s) return NextResponse.json({ error: "Vorschlag nicht gefunden.", code: "NOT_FOUND" }, { status: 404 });
  const items = JSON.parse(s.items) as ProfileItem[];
  if ("all" in parsed.data) {
    for (const it of items) if (it.status === "OPEN") it.status = "TAKEN";
  } else {
    if (!items[parsed.data.index]) return NextResponse.json({ error: "Punkt nicht gefunden.", code: "NOT_FOUND" }, { status: 404 });
    items[parsed.data.index].status = parsed.data.status;
  }
  const done = items.every((it) => it.status !== "OPEN");
  await audit({ action: "PROFILE_SUGGESTION_UPDATED", userId: auth.session.userId, meta: { suggestionId: id, ...("all" in parsed.data ? { all: true } : { index: parsed.data.index, status: parsed.data.status }), done } });
  // Ein zweiter DM hat ihn inzwischen erledigt/gelöscht → 404 statt Serverfehler (deleteMany/updateMany werfen nicht)
  if (done) {
    await prisma.profileSuggestion.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  const upd = await prisma.profileSuggestion.updateMany({ where: { id }, data: { items: JSON.stringify(items) } });
  if (upd.count === 0) return NextResponse.json({ error: "Vorschlag nicht gefunden.", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, items });
}
