import { NextResponse } from "next/server";
import type { GuestAccess } from "@/lib/guestServer";
import { getGuestStatusFeed } from "@/lib/guestStatusFeed";
import { greetingFromStay } from "@/lib/guestGreeting";

/**
 * Antwort von GET /api/guest/{r,s}/…/status — S1 (Entscheidung 16.11.2026: „immer der richtige Name“).
 * Begrüßung und Verlauf werden bei jeder Abfrage frisch aus dem gerade aktiven Aufenthalt bestimmt
 * (src/lib/guestStay.ts) und nie zwischengespeichert: `Cache-Control: no-store` (Browser, Proxy, Service Worker).
 * Kein aktiver Aufenthalt → 404 ohne Begründung; der Gastbildschirm wechselt dann auf die neutrale Seite.
 */
const NO_STORE = { "Cache-Control": "no-store, private, max-age=0" };

export async function guestStatusResponse(access: GuestAccess | null): Promise<NextResponse> {
  if (!access) return NextResponse.json({ error: "Not available.", code: "GUEST_NOT_AVAILABLE" }, { status: 404, headers: NO_STORE });
  const feed = await getGuestStatusFeed(access.room.id);
  return NextResponse.json({ greeting: greetingFromStay(access.stay), ...feed }, { headers: NO_STORE });
}
