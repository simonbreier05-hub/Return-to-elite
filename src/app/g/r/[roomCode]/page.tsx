import GuestView from "@/components/guest/GuestView";
import GuestUnavailable from "@/components/guest/GuestUnavailable";
import { resolveGuestAccessByRoomCode } from "@/lib/guestServer";

export const dynamic = "force-dynamic";

/**
 * NFC tag / QR code entry point for one room — Prompt G2 Teil 2. Always
 * resolves to whichever Stay is currently checked in for this room; no
 * such stay renders the same neutral "not available" page as an unknown
 * code (see GuestUnavailable — never distinguish the two).
 */
export default async function GuestRoomCodePage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const access = await resolveGuestAccessByRoomCode(roomCode);
  if (!access) return <GuestUnavailable />;

  return <GuestView roomNumber={access.room.number} floor={access.room.floor} actionBase={`/api/guest/r/${roomCode}`} />;
}
