import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Room } from "@prisma/client";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

/**
 * Guest self-service (see /guest/[roomToken]) is authorized purely by
 * possession of a per-room token — no login, no session. The token is a
 * persisted, randomly generated value (never derived from the room id or
 * number), so leaking one token can never forge access to another room and
 * there is no shared secret to protect.
 *
 * 24 random bytes, base64url-encoded (~32 chars) — plenty of entropy for a
 * value that is only ever compared via a unique-index DB lookup, never
 * guessed one character at a time.
 */
export function generateGuestToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}

/** Cheap shape check so an obviously-wrong token never reaches the DB. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Resolve a guest's opaque room token to its room. This is the entire
 * access-control boundary for the guest routes — every one of them must
 * call this first and treat a miss (`null`) as a generic "invalid link",
 * never distinguishing "malformed" from "well-formed but unknown".
 */
export async function resolveGuestRoom(token: string): Promise<Room | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  return prisma.room.findUnique({ where: { guestToken: token } });
}

// A fresh NextResponse every time — a Response body can only be read once,
// and this is otherwise the single most-returned response in the app, so a
// cached/shared instance would let one caller's read exhaust the body for
// every other caller of the same invalid-token miss.
const invalidLinkResponse = () => NextResponse.json({ error: "Link not found or expired." }, { status: 404 });

export type GuestGate =
  | { ok: true; room: Room; guestSource: string }
  | { ok: false; response: NextResponse };

/**
 * Shared prologue for every /api/guest/[roomToken]/* route: rate-limit,
 * then resolve the token. A malformed token and a well-formed-but-unknown
 * one must return the exact same response — no oracle for guessing.
 *
 * `routeName` scopes the rate-limit bucket per action (reading room info is
 * cheap and allowed more often than a mutating action).
 */
export async function guardGuestRequest(
  req: Request,
  roomToken: string,
  routeName: string,
  limits: { limit: number; windowMs: number }
): Promise<GuestGate> {
  const key = `guest:${routeName}:${clientKey(req)}`;
  const rate = checkRateLimit(key, limits);
  if (!rate.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: rate.retryAfterMs ? { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } : undefined }
      ),
    };
  }

  const room = await resolveGuestRoom(roomToken);
  if (!room) return { ok: false, response: invalidLinkResponse() };

  return { ok: true, room, guestSource: `Gast, Zimmer ${room.number}` };
}
