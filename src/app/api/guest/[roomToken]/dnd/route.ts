import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardGuestRequest } from "@/lib/rooms/resolveGuestRoom";
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";
import { addRoomNote } from "@/lib/rooms/addRoomNote";

/**
 * POST /api/guest/[roomToken]/dnd — "Bitte nicht stören". Goes through
 * applyStatusChange like every other status change in the app (see
 * ROLE_ALLOWED_TARGETS.guest in stateMachine.ts — a guest may only ever
 * reach BLOCKED, never CLEAN/INSPECTED/OUT_OF_ORDER/etc).
 */
const WINDOWS = ["2H", "TONIGHT", "INDEFINITE"] as const;

const Body = z.object({
  window: z.enum(WINDOWS),
  comment: z.string().trim().max(500).optional(),
});

function windowToBlockedUntil(window: (typeof WINDOWS)[number], now: Date): Date | undefined {
  if (window === "2H") return new Date(now.getTime() + 2 * 60 * 60_000);
  if (window === "TONIGHT") {
    const tonight = new Date(now);
    tonight.setHours(20, 0, 0, 0);
    return tonight.getTime() > now.getTime() ? tonight : new Date(now.getTime() + 2 * 60 * 60_000);
  }
  return undefined; // INDEFINITE — cleared manually by staff
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const gate = await guardGuestRequest(req, roomToken, "dnd", { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return gate.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const { room, guestSource } = gate;
  const blockedUntil = windowToBlockedUntil(parsed.data.window, new Date());

  const result = await applyStatusChange(
    { userId: null, name: guestSource, role: "guest" },
    room.id,
    { status: "BLOCKED", blockReason: "DND", blockedUntil }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (parsed.data.comment) {
    await addRoomNote(room.id, room.number, parsed.data.comment, { type: "guest", label: guestSource });
  }

  return NextResponse.json({ room: result.room });
}
