import { prisma } from "@/lib/db";
import { GUEST_ROOM_NUMBER, GUEST_SYSTEM_EMAIL } from "@/lib/guest";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest/room305 API route. */

export function getGuestRoom() {
  return prisma.room.findUnique({ where: { number: GUEST_ROOM_NUMBER } });
}

export async function getGuestSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: GUEST_SYSTEM_EMAIL } });
  if (!user) throw new Error(`Guest system account (${GUEST_SYSTEM_EMAIL}) is not seeded — run the seed script.`);
  return user.id;
}
