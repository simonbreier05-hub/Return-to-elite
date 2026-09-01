import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * Cross-department per-room notes (RoomNote). Extracted so the staff notes
 * route, the standalone "Nachricht an das Housekeeping" guest field, and the
 * optional comment inside the guest DND/cleaning panels all share one
 * implementation — comments never go through applyStatusChange's `note`
 * param, which maps to the PICKUP-specific reworkNote column, not a
 * generic note.
 */

export type NoteAuthor = { type: "staff"; userId: string } | { type: "guest"; label: string };

export async function addRoomNote(roomId: string, roomNumber: string, body: string, author: NoteAuthor) {
  const note = await prisma.roomNote.create({
    data: {
      roomId,
      authorId: author.type === "staff" ? author.userId : null,
      guestSource: author.type === "guest" ? author.label : null,
      body,
    },
    include: { author: { select: { name: true, role: true } } },
  });

  await audit({
    action: "NOTE_ADDED",
    userId: author.type === "staff" ? author.userId : null,
    roomId,
    meta: author.type === "guest" ? { guestSource: author.label } : undefined,
  });

  broadcast("note:new", { note, roomNumber });

  return note;
}
