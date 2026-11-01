import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { addRoomNote } from "@/lib/rooms/addRoomNote";
import { PauseTargetSchema } from "@/lib/domain";
import { messageAccess, sessionSeesMessages } from "@/lib/work/messages";

/**
 * Cross-department per-room notes: every authenticated role may read & add.
 * Nachrichten (`kind: "MESSAGE"`, an Zimmer/Aufgabe während der Arbeit) sehen und schreiben nur Beteiligte
 * (src/lib/work/access.ts `canSeeMessages`): zuständiges Zimmermädchen, Supervisor der Etage, beteiligter Hausmann/Techniker,
 * Duty Manager. Für alle anderen fehlen sie in der Liste.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const notes = await prisma.roomNote.findMany({
    where: { roomId: id },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, role: true } } },
  });
  const { canMessage, outOfScope } = await messageAccess(auth.session, id);
  return NextResponse.json({ notes: canMessage ? notes : notes.filter((n) => n.kind !== "MESSAGE"), canMessage, outOfScope });
}

const NoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  kind: z.enum(["NOTE", "MESSAGE"]).optional(),
  task: z.object({ type: PauseTargetSchema, id: z.string().min(1) }).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = NoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Note body required.", code: "TEXT_REQUIRED" }, { status: 400 });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Room not found.", code: "ROOM_NOT_FOUND" }, { status: 404 });

  const kind = parsed.data.kind ?? (parsed.data.task ? "MESSAGE" : "NOTE");
  if (kind === "MESSAGE" && !(await sessionSeesMessages(auth.session, room.id))) {
    return NextResponse.json({ error: "Nachrichten an dieses Zimmer können nur Beteiligte schreiben.", code: "MESSAGES_PARTICIPANTS_ONLY" }, { status: 403 });
  }
  const note = await addRoomNote({ room, authorId: auth.session.userId, body: parsed.data.body, kind, task: parsed.data.task ?? null });
  return NextResponse.json({ note }, { status: 201 });
}
