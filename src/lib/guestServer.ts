import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest API route. */

export function getGuestRoom(roomNumber: string) {
  return prisma.room.findUnique({ where: { number: roomNumber } });
}

export async function getGuestSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: GUEST_SYSTEM_EMAIL } });
  if (!user) throw new Error(`Guest system account (${GUEST_SYSTEM_EMAIL}) is not seeded — run the seed script.`);
  return user.id;
}
