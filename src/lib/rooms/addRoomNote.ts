import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { NoteKind, PauseTarget } from "@/lib/domain";
import { notifyHousekeeperOfRoomChange } from "./notifyRoomChange";
import { notifyMessage } from "@/lib/work/messages";

/**
 * Add a cross-department room note + audit entry + realtime broadcast.
 *
 * Pulled out of the staff-facing route (POST /api/rooms/[id]/notes) so the
 * guest-facing message action (src/lib/guestActions.ts, POST
 * /api/guest/{r,s}/<code|token>/notes) writes into the exact same RoomNote
 * table — no parallel "guest message" structure — and shows up in the
 * Supervisor/Attendant note lists exactly like any other note.
 *
 * `kind: "MESSAGE"` ist eine Nachricht an Zimmer/Aufgabe während der Arbeit (gleiche Tabelle, gleicher Verlauf): sie geht als
 * Meldung an alle Beteiligten (src/lib/work/messages.ts). Eine normale Notiz meldet nur dem zuständigen Zimmermädchen
 * „neue Notiz“. Logbuch ohne Text.
 */
export async function addRoomNote(input: {
  room: { id: string; number: string };
  authorId: string;
  body: string;
  kind?: NoteKind;
  task?: { type: PauseTarget; id: string } | null;
}) {
  const { room, authorId, body, kind = "NOTE", task } = input;

  const note = await prisma.roomNote.create({
    data: { roomId: room.id, authorId, body, kind, taskType: task?.type ?? null, taskId: task?.id ?? null },
    include: { author: { select: { name: true, role: true } } },
  });
  await audit({ action: kind === "MESSAGE" ? "TASK_MESSAGE" : "NOTE_ADDED", userId: authorId, roomId: room.id, meta: task ? { taskType: task.type, taskId: task.id } : undefined });
  broadcast("note:new", { note, roomNumber: room.number });

  if (kind === "MESSAGE") await notifyMessage({ room, author: { id: authorId, name: note.author?.name ?? "—", role: note.author?.role ?? "" } });
  else await notifyHousekeeperOfRoomChange({ roomId: room.id, kind: "NOTE", actorId: authorId });

  return note;
}
