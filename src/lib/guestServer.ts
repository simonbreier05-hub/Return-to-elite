import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest/room305 API route. */

/**
 * Which room the demo points at — not the same on every deployment. The
 * branch consolidation that brought in the real, photographed Hotel de Rome
 * floor plan (src/lib/floorplan/hotelDeRome.ts) dropped room 305 from the
 * seeded inventory entirely — floor 3 skips straight from 304 to 307-310 on
 * the actual plan. 310 is the closest room to the old demo default and
 * doubles as the "Sig. Bianchi golf outing" excursion seeded in
 * prisma/seed.ts, so it's the new default for this app's own seed on `main`
 * and local dev. Override with the GUEST_ROOM_NUMBER env var per deployment
 * rather than forking this constant. Server-only (not in guest.ts) because
 * that file is also imported client-side, where process.env isn't available.
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
