import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ settings: await getSettings() });
}

const Body = z.object({
  blockedRecheckMinutes: z.number().int().positive().optional(),
  welfareCheckMinutes: z.number().int().positive().optional(),
  etaWarningMinutes: z.number().int().positive().optional(),
  releaseQueueBacklogThreshold: z.number().int().positive().optional(),
});

/** PATCH /api/settings — duty_manager tunes escalation thresholds. */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }
  await audit({ action: "SETTINGS_UPDATED", userId: auth.session.userId, meta: parsed.data });
  return NextResponse.json({ settings: await getSettings() });
}
