import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";
import { HK_RESTRICTIONS, HK_TYPES } from "@/lib/autoplan/types";

const Body = z.object({
  hkType: z.enum(HK_TYPES).optional(), // Planung L1: + EXTERN (Springer/Aushilfe)
  hkLevel: z.number().int().min(1).max(3).optional(),
  homeFloors: z.array(z.number().int().min(1).max(7)).max(2).optional(),
  dailyTarget: z.number().int().min(0).max(30).nullable().optional(), // Plan-1b: persönliches Tagesziel in Zimmern
  hkActive: z.boolean().optional(),
  // Planung L1 (Regel 5): Einschränkungen je Person, nur feste Codes
  hkRestrictions: z.array(z.enum(HK_RESTRICTIONS)).max(HK_RESTRICTIONS.length).optional(),
}).strict();

/**
 * PATCH /api/housekeepers/[id] — Typ, Stufe, Präferenz-Etagen, Tagesziel, aktiv, Einschränkungen. Protokoll nur mit dem
 * Hinweis "geändert", ohne Werte. Planung L1 (Regel 6): die Stufe (Level 1–3) pflegt nur der Duty Manager.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben.", code: "INVALID_INPUT" }, { status: 400 });
  if (parsed.data.hkLevel !== undefined && auth.session.role !== "duty_manager") {
    return NextResponse.json({ error: "Die Stufe ändert nur der Duty Manager.", code: "HK_LEVEL_DM_ONLY" }, { status: 403 });
  }
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.role !== "room_attendant") return NextResponse.json({ error: "Housekeeper nicht gefunden.", code: "USER_NOT_FOUND" }, { status: 404 });
  const { homeFloors, hkRestrictions, ...rest } = parsed.data;
  await prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...(homeFloors ? { homeFloors: [...new Set(homeFloors)].join(",") } : {}),
      ...(hkRestrictions ? { hkRestrictions: [...new Set(hkRestrictions)].join(",") } : {}),
    },
  });
  await audit({ action: "HK_PROFILE_UPDATED", userId: auth.session.userId, meta: { hkId: id, fields: Object.keys(parsed.data) } });
  return NextResponse.json({ ok: true });
}
