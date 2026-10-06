import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";

const Body = z.object({
  hkType: z.enum(["VOLLZEIT", "TEILZEIT", "AZUBI"]).optional(),
  hkLevel: z.number().int().min(1).max(3).optional(),
  homeFloors: z.array(z.number().int().min(1).max(7)).max(2).optional(),
  dailyTarget: z.number().min(0).max(40).nullable().optional(),
  hkActive: z.boolean().optional(),
}).strict();

/** PATCH /api/housekeepers/[id] — Typ, Stufe, Stammetagen, Tagesziel, aktiv. Protokoll nur mit dem Hinweis "geändert", ohne Werte. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.role !== "room_attendant") return NextResponse.json({ error: "Housekeeper nicht gefunden." }, { status: 404 });
  const { homeFloors, ...rest } = parsed.data;
  await prisma.user.update({
    where: { id },
    data: { ...rest, ...(homeFloors ? { homeFloors: [...new Set(homeFloors)].join(",") } : {}) },
  });
  await audit({ action: "HK_PROFILE_UPDATED", userId: auth.session.userId, meta: { hkId: id, fields: Object.keys(parsed.data) } });
  return NextResponse.json({ ok: true });
}
