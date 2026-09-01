import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardGuestRequest } from "@/lib/rooms/resolveGuestRoom";
import { addRoomNote } from "@/lib/rooms/addRoomNote";

/** POST /api/guest/[roomToken]/note — standalone "Nachricht an das Housekeeping". */
const Body = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const gate = await guardGuestRequest(req, roomToken, "note", { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return gate.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Note body required." }, { status: 400 });

  const { room, guestSource } = gate;
  const note = await addRoomNote(room.id, room.number, parsed.data.body, { type: "guest", label: guestSource });

  return NextResponse.json({ note }, { status: 201 });
}
