import { prisma } from "@/lib/db";
import { generateOpaqueToken } from "@/lib/guestToken";

const MAX_ATTEMPTS = 5;

/**
 * Returns this room's NFC/QR access code, generating and persisting one on
 * first use. Collisions are astronomically unlikely at 128 bit but the
 * unique constraint is retried a few times regardless rather than trusted
 * blindly.
 */
export async function ensureRoomAccessCode(roomId: string): Promise<string> {
  const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId }, select: { guestAccessCode: true } });
  if (room.guestAccessCode) return room.guestAccessCode;
  return regenerateRoomAccessCode(roomId);
}

/**
 * Always issues a fresh code, overwriting any existing one — the old
 * NFC tag/QR print immediately stops resolving. Used when a tag is lost
 * (Prompt G2 Teil 2, QR/NFC generator page).
 */
export async function regenerateRoomAccessCode(roomId: string, attemptsLeft = MAX_ATTEMPTS): Promise<string> {
  const code = generateOpaqueToken();
  try {
    await prisma.room.update({ where: { id: roomId }, data: { guestAccessCode: code } });
    return code;
  } catch (err) {
    const isUniqueClash = typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
    if (!isUniqueClash || attemptsLeft <= 1) throw err;
    return regenerateRoomAccessCode(roomId, attemptsLeft - 1);
  }
}
