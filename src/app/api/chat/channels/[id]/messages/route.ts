import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessibleChannel, directStillAllowed, listMessages, postMessage } from "@/lib/chat/service";
import { sanitizeBody } from "@/lib/chat/text";
import { checkChatRateLimit } from "@/lib/chat/rateLimit";
import { chatAuth } from "../../../_session";

/** GET /api/chat/channels/[id]/messages?before=ISO — Verlauf (neueste unten), nur wenn ich den Kanal lesen darf. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const { id } = await params;
  if (!(await accessibleChannel(a.s, id))) return NextResponse.json({ error: "Kein Zugriff auf diesen Kanal." }, { status: 403 });
  const beforeRaw = req.nextUrl.searchParams.get("before");
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;
  return NextResponse.json(await listMessages(id, before));
}

const Body = z.object({ body: z.string().max(5000), urgent: z.boolean().optional() });

/** POST — Nachricht senden. Rechte (Kanal/Direkt inkl. Housekeeper-Regel), Länge, Bereinigung und Rate-Limit auf dem Server. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const { id } = await params;
  const ch = await accessibleChannel(a.s, id);
  if (!ch || !(await directStillAllowed(a.s, ch))) return NextResponse.json({ error: "Kein Zugriff auf diesen Kanal." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Nachricht." }, { status: 400 });
  const clean = sanitizeBody(parsed.data.body);
  if (!clean.ok) return NextResponse.json({ error: clean.error === "TOO_LONG" ? "Nachricht ist zu lang." : "Nachricht ist leer." }, { status: 400 });
  const limit = checkChatRateLimit(a.s.userId);
  if (!limit.ok) return NextResponse.json({ error: "Zu viele Nachrichten — bitte kurz warten." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const message = await postMessage(a.s, ch, clean.body, !!parsed.data.urgent);
  return NextResponse.json({ message }, { status: 201 });
}
