import GuestView from "@/components/guest/GuestView";
import GuestUnavailable from "@/components/guest/GuestUnavailable";
import { getGuestLegalLinks } from "@/lib/guestLegalLinks";
import { greetingFromStay } from "@/lib/guestGreeting";
import { resolveGuestAccessByRoomCode, splitRoomParam, stayRef } from "@/lib/guestServer";

export const dynamic = "force-dynamic";

/**
 * NFC tag / QR code entry point for one room — Prompt G2 Teil 2. Always
 * resolves to whichever Stay is currently checked in for this room; no
 * such stay renders the same neutral "not available" page as an unknown
 * code (see GuestUnavailable — never distinguish the two).
 *
 * F9 (A3): Die Seite bindet sich an den Aufenthalt, den sie beim Laden vorfindet (`actionBase` = `<code>.<ref>`). Endet er,
 * lädt der Client mit `?ended=1` neu — dann wird gar nichts aufgelöst, der Name verschwindet auch aus den Seitendaten.
 */
export default async function GuestRoomCodePage({ params, searchParams }: { params: Promise<{ roomCode: string }>; searchParams: Promise<{ ended?: string }> }) {
  const [{ roomCode }, { ended }] = await Promise.all([params, searchParams]);
  const legalLinks = await getGuestLegalLinks();
  if (ended === "1") return <GuestUnavailable legalLinks={legalLinks} />;
  const access = await resolveGuestAccessByRoomCode(roomCode);
  if (!access) return <GuestUnavailable legalLinks={legalLinks} />;

  return (
    <GuestView
      roomNumber={access.room.number}
      floor={access.room.floor}
      actionBase={`/api/guest/r/${splitRoomParam(roomCode).code}.${stayRef(access.stay.id)}`}
      stayLanguage={access.stay.language}
      greeting={greetingFromStay(access.stay)}
      legalLinks={legalLinks}
    />
  );
}
