import GuestView from "@/components/guest/GuestView";
import GuestUnavailable from "@/components/guest/GuestUnavailable";
import { getGuestLegalLinks } from "@/lib/guestLegalLinks";
import { greetingFromStay } from "@/lib/guestGreeting";
import { resolveGuestAccessByStayToken } from "@/lib/guestServer";

export const dynamic = "force-dynamic";

/**
 * Pre-arrival email link entry point for one stay — Prompt G2 Teil 2.
 * Valid from the arrival day through departure plus a grace period (see
 * src/lib/guestStay.ts isStayTokenValid). Unknown, expired or cancelled
 * all render the same neutral "not available" page (see GuestUnavailable
 * — never distinguish the two).
 */
export default async function GuestStayTokenPage({ params, searchParams }: { params: Promise<{ stayToken: string }>; searchParams: Promise<{ ended?: string }> }) {
  const [{ stayToken }, { ended }] = await Promise.all([params, searchParams]);
  const legalLinks = await getGuestLegalLinks();
  if (ended === "1") return <GuestUnavailable legalLinks={legalLinks} />; // F9 (A3): beendet → nichts auflösen
  const access = await resolveGuestAccessByStayToken(stayToken);
  if (!access) return <GuestUnavailable legalLinks={legalLinks} />;

  return (
    <GuestView
      roomNumber={access.room.number}
      floor={access.room.floor}
      actionBase={`/api/guest/s/${stayToken}`}
      stayLanguage={access.stay.language}
      greeting={greetingFromStay(access.stay)}
      legalLinks={legalLinks}
    />
  );
}
