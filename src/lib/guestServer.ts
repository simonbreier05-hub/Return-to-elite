import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest/room305 API route. */

/**
 * Which room the demo points at — not the same on every deployment. Each
 * branch/environment seeds its own room inventory (Railway's
 * StayClean-preview reworked its seed to a real, photographed floor plan
 * and no longer has room 305 at all — the closest that branch came was
 * relocating this exact demo scenario, "Sig. Bianchi's golf outing," to
 * 310). Override with the GUEST_ROOM_NUMBER env var per deployment rather
 * than forking this constant; "305" stays the default for anything that
 * doesn't set it (this app's own seed on `main`, local dev). Server-only
 * (not in guest.ts) because that file is also imported client-side, where
 * process.env isn't available.
 */
export const GUEST_ROOM_NUMBER = process.env.GUEST_ROOM_NUMBER?.trim() || "305";

export function getGuestRoom() {
  return prisma.room.findUnique({ where: { number: GUEST_ROOM_NUMBER } });
}

export async function getGuestSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: GUEST_SYSTEM_EMAIL } });
  if (!user) throw new Error(`Guest system account (${GUEST_SYSTEM_EMAIL}) is not seeded — run the seed script.`);
  return user.id;
}
