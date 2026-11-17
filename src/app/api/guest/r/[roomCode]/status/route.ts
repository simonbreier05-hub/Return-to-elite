import { resolveGuestAccessByRoomCode } from "@/lib/guestServer";
import { guestStatusResponse } from "@/lib/guestStatusResponse";

export const dynamic = "force-dynamic";

/**
 * GET /api/guest/r/<roomCode>/status — Begrüßung und eigene Anfragen des Gasts, den das Zimmer gerade hat
 * (S1, src/lib/guestStatusResponse.ts). Vom Gastbildschirm abgefragt, nie über den Live-Kanal: der ist nur für
 * angemeldete Mitarbeiter (socketAuth.js).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return guestStatusResponse(await resolveGuestAccessByRoomCode(roomCode));
}
