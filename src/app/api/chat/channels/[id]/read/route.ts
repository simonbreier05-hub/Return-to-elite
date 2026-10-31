import { NextResponse } from "next/server";
import { accessibleChannel, markRead } from "@/lib/chat/service";
import { chatAuth } from "../../../_session";

/** POST /api/chat/channels/[id]/read — alles bis jetzt gelesen. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const { id } = await params;
  if (!(await accessibleChannel(a.s, id))) return NextResponse.json({ error: "Kein Zugriff auf diesen Kanal.", code: "CHANNEL_FORBIDDEN" }, { status: 403 });
  await markRead(a.s, id);
  return NextResponse.json({ ok: true });
}
