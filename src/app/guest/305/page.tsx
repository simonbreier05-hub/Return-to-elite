import GuestView from "./view";
import { GUEST_ROOM_NUMBER } from "@/lib/guestServer";

// Read GUEST_ROOM_NUMBER fresh per request rather than baking in whatever it
// was at build time — this route would otherwise be static-optimized (no
// session/DB read), and env vars aren't guaranteed to be build-time-visible
// the way they are at runtime on every deploy target.
export const dynamic = "force-dynamic";

/**
 * TEST/DEMO entry point — simulates what a guest will eventually reach via
 * an NFC tag or pre-arrival link. The room shown is GUEST_ROOM_NUMBER
 * (guestServer.ts), env-overridable per deployment — see that file for why.
 * Deliberately does NOT call requirePage()/getSession(): a guest has no
 * staff account. Reached today from the login screen's "Guest" tile
 * (src/app/login/page.tsx) — safe to delete both once the real guest
 * access path exists.
 */
export default function GuestRoom305Page() {
  const floor = Number(GUEST_ROOM_NUMBER[0]);
  return <GuestView roomNumber={GUEST_ROOM_NUMBER} floor={floor} />;
}
