import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";
import { currentStayForRoom, resolveStayByToken } from "@/lib/guestStay";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest API route. */

export interface GuestAccess {
  room: { id: string; number: string; floor: number };
  stay: { id: string; guestName: string; language: string; checkIn: Date; checkOut: Date; status: string };
}

/**
 * NFC/QR entry point (Prompt G2 Teil 2): resolves a room's opaque access
 * code straight to whichever Stay is currently checked in — never to the
 * room by itself. No current stay means no access, same as an unknown code.
 */
export async function resolveGuestAccessByRoomCode(roomCode: string): Promise<GuestAccess | null> {
  const room = await prisma.room.findUnique({ where: { guestAccessCode: roomCode } });
  if (!room) return null;
  const stay = await currentStayForRoom(room.id);
  if (!stay) return null;
  return { room, stay };
}

/** Pre-arrival email link entry point (Prompt G2 Teil 2): resolves straight off the Stay's own token. */
export async function resolveGuestAccessByStayToken(stayToken: string): Promise<GuestAccess | null> {
  const stay = await resolveStayByToken(stayToken);
  if (!stay) return null;
  const { room, ...stayOnly } = stay;
  return { room, stay: stayOnly };
}

export async function getGuestSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: GUEST_SYSTEM_EMAIL } });
  if (!user) throw new Error(`Guest system account (${GUEST_SYSTEM_EMAIL}) is not seeded — run the seed script.`);
  return user.id;
}
