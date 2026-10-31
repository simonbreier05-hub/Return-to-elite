import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openDirect } from "@/lib/chat/service";
import { chatAuth } from "../_session";

const Body = z.object({ userId: z.string().min(1).max(100) });

/** POST /api/chat/direct {userId} — Direkt-Unterhaltung öffnen; 403, wenn die Regel (Housekeeper) es nicht erlaubt. */
export async function POST(req: NextRequest) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "userId fehlt." }, { status: 400 });
  const ch = await openDirect(a.s, parsed.data.userId);
  if (!ch) return NextResponse.json({ error: "Direktnachricht an diese Person ist nicht erlaubt." }, { status: 403 });
  return NextResponse.json({ channelId: ch.id });
}
