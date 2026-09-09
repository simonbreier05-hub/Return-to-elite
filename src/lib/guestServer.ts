import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest/room305 API route. */

/**
 * Which room the demo points at — not the same on every deployment. This
 * app's own seed (prisma/seed.ts) now reads the real, digitized Hotel de
 * Rome floor plan (src/lib/floorplan/hotelDeRome.ts) and no longer has room
 * 305 at all — so, same as the Railway StayClean-preview deployment this
 * comment used to describe, the demo scenario moved to 310, the nearest
 * real key on that floor. Override with the GUEST_ROOM_NUMBER env var per
 * deployment rather than forking this constant. Server-only (not in
 * guest.ts) because that file is also imported client-side, where
 * process.env isn't available.
 */
export const GUEST_ROOM_NUMBER = process.env.GUEST_ROOM_NUMBER?.trim() || "310";

export function getGuestRoom() {
  return prisma.room.findUnique({ where: { number: GUEST_ROOM_NUMBER } });
}

export async function getGuestSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: GUEST_SYSTEM_EMAIL } });
  if (!user) throw new Error(`Guest system account (${GUEST_SYSTEM_EMAIL}) is not seeded — run the seed script.`);
  return user.id;
}
