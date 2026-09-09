import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { getPriorityWeights, getSettings, WEIGHT_PREFIX } from "@/lib/settings";
import { PRIORITY_WEIGHTS } from "@/lib/priority/computePriority";
import { audit } from "@/lib/audit";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    settings: await getSettings(),
    weights: await getPriorityWeights(),
    weightDefaults: PRIORITY_WEIGHTS,
  });
}

const Body = z.object({
  blockedRecheckMinutes: z.number().int().positive().optional(),
  welfareCheckMinutes: z.number().int().positive().optional(),
  etaWarningMinutes: z.number().int().positive().optional(),
  releaseQueueBacklogThreshold: z.number().int().positive().optional(),
  roomsPerAttendantMin: z.number().int().min(1).max(30).optional(),
  roomsPerAttendantMax: z.number().int().min(1).max(30).optional(),
  attendantPoolMax: z.number().int().min(1).max(50).optional(),
  /** Priority weights, by their name in PRIORITY_WEIGHTS. Zero is allowed — it
   *  is how a house switches a signal off entirely. */
  weights: z.record(z.string(), z.number().min(0).max(1000)).optional(),
});

/** PATCH /api/settings — duty_manager tunes escalation thresholds. */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });

  const { roomsPerAttendantMin: minRooms, roomsPerAttendantMax: maxRooms } = parsed.data;
  if (minRooms !== undefined && maxRooms !== undefined && minRooms > maxRooms) {
    return NextResponse.json({ error: "roomsPerAttendantMin cannot be greater than roomsPerAttendantMax." }, { status: 400 });
  }
  // A lone min/max change is checked against whatever the other one currently
  // is, so a save can never leave the pair inverted in the database either.
  if (minRooms !== undefined && maxRooms === undefined) {
    const current = await getSettings();
    if (minRooms > current.roomsPerAttendantMax) {
      return NextResponse.json({ error: "roomsPerAttendantMin cannot be greater than roomsPerAttendantMax." }, { status: 400 });
    }
  }
  if (maxRooms !== undefined && minRooms === undefined) {
    const current = await getSettings();
    if (maxRooms < current.roomsPerAttendantMin) {
      return NextResponse.json({ error: "roomsPerAttendantMax cannot be less than roomsPerAttendantMin." }, { status: 400 });
    }
  }

  const { weights, ...thresholds } = parsed.data;

  for (const [key, value] of Object.entries(thresholds)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }

  // Ignore unknown weight names rather than storing junk that getPriorityWeights
  // would silently drop later.
  const known = new Set(Object.keys(PRIORITY_WEIGHTS));
  for (const [name, value] of Object.entries(weights ?? {})) {
    if (!known.has(name)) continue;
    const key = `${WEIGHT_PREFIX}${name}`;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }

  await audit({ action: "SETTINGS_UPDATED", userId: auth.session.userId, meta: parsed.data });
  return NextResponse.json({
    settings: await getSettings(),
    weights: await getPriorityWeights(),
    weightDefaults: PRIORITY_WEIGHTS,
  });
}
