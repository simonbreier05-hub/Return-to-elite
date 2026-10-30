import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/rbac";
import { PauseReasonSchema, PauseTargetSchema } from "@/lib/domain";
import { setPause } from "@/lib/work/pauseData";

const Body = z.object({
  targetType: PauseTargetSchema,
  targetId: z.string().min(1),
  action: z.enum(["pause", "resume"]),
  reason: PauseReasonSchema.nullish(),
}).strict();

/**
 * POST /api/work/pause — Aufgabe pausieren oder fortsetzen (Zimmer, Hausmann-Aufgabe/-Trace, Arbeitsauftrag).
 * Ein Mechanismus für alle Abteilungen; wer darf, entscheiden die Regeln in src/lib/work/access.ts (`checkPause`).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "targetType, targetId und action (pause|resume) erforderlich." }, { status: 400 });
  const { targetType, targetId, action, reason } = parsed.data;
  const result = await setPause(auth.session, targetType, targetId, action, reason ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ paused: result.paused, pause: result.pause });
}
