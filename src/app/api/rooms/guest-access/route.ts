import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { ensureRoomAccessCode } from "@/lib/guestRoomCode";

/**
 * GET /api/rooms/guest-access — staff-only listing behind the QR/NFC
 * generator page (Prompt G2 Teil 2, supervisor/duty_manager). Every room
 * gets its access code ensured (generated on first use) so the page never
 * shows a room with nothing to print.
 */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const rooms = await prisma.room.findMany({
    orderBy: [{ floor: "asc" }, { number: "asc" }],
    select: { id: true, number: true, floor: true, section: true, guestAccessCode: true },
  });

  const withCodes = await Promise.all(
    rooms.map(async (room) => ({
      id: room.id,
      number: room.number,
      floor: room.floor,
      section: room.section,
      code: room.guestAccessCode ?? (await ensureRoomAccessCode(room.id)),
    }))
  );

  return NextResponse.json({ rooms: withCodes });
}
