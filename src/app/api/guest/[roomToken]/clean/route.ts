import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardGuestRequest } from "@/lib/rooms/resolveGuestRoom";
import { requestGuestCleaning } from "@/lib/rooms/requestGuestCleaning";
import { addRoomNote } from "@/lib/rooms/addRoomNote";

/**
 * POST /api/guest/[roomToken]/clean — "Jetzt reinigen". Not a status change
 * (the room stays whatever it already is) — see requestGuestCleaning.
 */
const Body = z.object({
  target: z.enum(["now", "soon", "later"]),
  laterAt: z.coerce.date().optional(),
  comment: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const gate = await guardGuestRequest(req, roomToken, "clean", { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return gate.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (parsed.data.target === "later" && !parsed.data.laterAt) {
    return NextResponse.json({ error: "laterAt is required when target is 'later'." }, { status: 400 });
  }

  const { room, guestSource } = gate;
  const result = await requestGuestCleaning(room.id, room.number, guestSource, {
    target: parsed.data.target,
    laterAt: parsed.data.laterAt,
  });

  if (parsed.data.comment) {
    await addRoomNote(room.id, room.number, parsed.data.comment, { type: "guest", label: guestSource });
  }

  return NextResponse.json(result);
}
