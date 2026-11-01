import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getChatSettings } from "@/lib/settings";
import { normalizeLanguage } from "@/lib/i18n/languages";
import { audit } from "@/lib/audit";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const [user, cfg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.session.userId },
      select: { id: true, name: true, email: true, role: true, section: true, currentRoomId: true, language: true },
    }),
    getChatSettings(),
  ]);
  // language null = noch nie gewählt → der Client schlägt die Browser-Sprache vor (Prompt K1).
  return NextResponse.json({ user, hotelDefaultLanguage: cfg.hotelDefaultLanguage });
}

const Body = z.object({ language: z.string().max(12).nullable() });

/** PATCH /api/auth/me — eigene Oberflächensprache speichern (gilt auf jedem Gerät). null = Hotel-Standard. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload.", code: "INVALID_INPUT" }, { status: 400 });
  const language = parsed.data.language === null ? null : normalizeLanguage(parsed.data.language);
  if (parsed.data.language !== null && !language) {
    return NextResponse.json({ error: "Unknown language.", code: "UNKNOWN_LANGUAGE" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: auth.session.userId }, data: { language } });
  await audit({ action: "USER_LANGUAGE_SET", userId: auth.session.userId, meta: { language } });
  return NextResponse.json({ language });
}
