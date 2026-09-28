import GuestView from "./view";
import { getGuestRoom } from "@/lib/guestServer";

// Read the room fresh per request rather than baking it in at build time —
// this route would otherwise be static-optimized (no DB read), and a room's
// existence/floor can't be known until the page is actually requested.
export const dynamic = "force-dynamic";

/**
 * Guest entry point — reached via an NFC tag or pre-arrival link pointing at
 * this room's own URL, e.g. /g/412. No AppShell, no session: a guest has
 * no staff account, so this deliberately does NOT call requirePage()/getSession().
 *
 * Interim route: resolves straight off the plain room number for now. Prompt
 * G2 Teil 2 replaces this with opaque, token-based access —
 * /g/r/<roomCode> (NFC/QR) and /g/s/<stayToken> (pre-arrival link) — at
 * which point this [roomNumber] route retires. See docs/guest-api.md.
 */
export default async function GuestRoomPage({ params }: { params: Promise<{ roomNumber: string }> }) {
  const { roomNumber } = await params;
  const room = await getGuestRoom(roomNumber);

  if (!room) return <GuestRoomNotFound roomNumber={roomNumber} />;

  return <GuestView roomNumber={room.number} floor={room.floor} />;
}

function GuestRoomNotFound({ roomNumber }: { roomNumber: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div
        className="w-full max-w-sm rounded-2xl border px-6 py-8 text-center shadow-sm"
        style={{ borderColor: "var(--g-panel)", background: "white" }}
      >
        <img src="/guest/hotel-crest.svg" alt="" className="mx-auto mb-4 h-10 w-10" />
        <h1 className="font-serif text-2xl" style={{ color: "var(--g-navy)" }}>
          Zimmer nicht gefunden
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--g-muted)" }}>
          Für „{roomNumber}“ konnten wir kein Zimmer finden. Bitte wenden Sie sich an die Rezeption.
        </p>
      </div>
    </div>
  );
}
