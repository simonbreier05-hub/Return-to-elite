import GuestView from "@/components/guest/GuestView";
import GuestUnavailable from "@/components/guest/GuestUnavailable";
import { resolveGuestAccessByStayToken } from "@/lib/guestServer";

export const dynamic = "force-dynamic";

/**
 * Pre-arrival email link entry point for one stay — Prompt G2 Teil 2.
 * Valid from the arrival day through departure plus a grace period (see
 * src/lib/guestStay.ts isStayTokenValid). Unknown, expired or cancelled
 * all render the same neutral "not available" page (see GuestUnavailable
 * — never distinguish the two).
 */
export default async function GuestStayTokenPage({ params }: { params: Promise<{ stayToken: string }> }) {
  const { stayToken } = await params;
  const access = await resolveGuestAccessByStayToken(stayToken);
  if (!access) return <GuestUnavailable />;

  return <GuestView roomNumber={access.room.number} floor={access.room.floor} actionBase={`/api/guest/s/${stayToken}`} />;
}
