import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { roomsFor } from "@/lib/chat/service";
import { joinChatRooms } from "@/lib/realtime";
import { chatAuth } from "../_session";

const Body = z.object({ socketId: z.string().min(1).max(64) });

/**
 * POST /api/chat/join {socketId} — setzt den eigenen Socket serverseitig in genau die erlaubten Räume (Kanäle laut policy,
 * eigene Direkt-Unterhaltungen, persönlicher Raum). Der Client kann Räume nicht selbst betreten.
 */
export async function POST(req: NextRequest) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "socketId fehlt.", code: "INVALID_INPUT" }, { status: 400 });
  const rooms = await roomsFor(a.s);
  const r = joinChatRooms(parsed.data.socketId, a.s.userId, rooms);
  if (r === "foreign") return NextResponse.json({ error: "Verbindung gehört einer anderen Person.", code: "NO_PERMISSION" }, { status: 403 });
  return NextResponse.json({ joined: r === "ok" ? rooms.length : 0 });
}
