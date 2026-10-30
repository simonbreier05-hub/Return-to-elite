import { NextResponse } from "next/server";
import { listChannels } from "@/lib/chat/service";
import { chatAuth } from "../_session";

/** GET /api/chat/channels — meine Kanäle + Direkt-Unterhaltungen mit Ungelesen-Zähler. */
export async function GET() {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const channels = await listChannels(a.s);
  return NextResponse.json({ me: { id: a.s.userId, role: a.s.role }, channels, unread: channels.reduce((n, c) => n + c.unread, 0), canReview: a.s.role === "duty_manager" });
}
