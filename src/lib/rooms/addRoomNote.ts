import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * Add a cross-department room note + audit entry + realtime broadcast.
 *
 * Pulled out of the staff-facing route (POST /api/rooms/[id]/notes) so the
 * guest-facing message field (POST /api/guest/[roomNumber]/notes) writes
 * into the exact same RoomNote table — no parallel "guest message"
 * structure — and shows up in the Supervisor/Attendant note lists exactly
 * like any other note.
 */
export async function addRoomNote(input: { room: { id: string; number: string }; authorId: string; body: string }) {
  const { room, authorId, body } = input;

  const note = await prisma.roomNote.create({
    data: { roomId: room.id, authorId, body },
    include: { author: { select: { name: true, role: true } } },
  });
  await audit({ action: "NOTE_ADDED", userId: authorId, roomId: room.id });
  broadcast("note:new", { note, roomNumber: room.number });

  return note;
}
