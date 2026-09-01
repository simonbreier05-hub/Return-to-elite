import { notFound } from "next/navigation";
import { resolveGuestRoom } from "@/lib/rooms/resolveGuestRoom";
import GuestScreen from "./GuestScreen";

/**
 * /guest/[roomToken] — no login, no session. The token is resolved
 * server-side; possession of it is the entire authorization. A missing or
 * tampered token renders the same generic "not found" as any other room —
 * there is no distinct "invalid token" state to leak.
 */
export default async function GuestPage({ params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const room = await resolveGuestRoom(roomToken);
  if (!room) notFound();

  return <GuestScreen roomToken={roomToken} roomNumber={room.number} floor={room.floor} />;
}
