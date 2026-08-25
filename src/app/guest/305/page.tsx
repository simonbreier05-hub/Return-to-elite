import GuestView from "./view";

/**
 * TEST/DEMO entry point — simulates what a guest will eventually reach via
 * an NFC tag or pre-arrival link, hard-wired to room 305 for this test
 * phase. Deliberately does NOT call requirePage()/getSession(): a guest has
 * no staff account. Reached today from the login screen's "Guest" tile
 * (src/app/login/page.tsx) — safe to delete both once the real guest
 * access path exists.
 */
export default function GuestRoom305Page() {
  return <GuestView roomNumber="305" floor={3} />;
}
