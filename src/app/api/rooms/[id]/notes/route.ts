import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { addRoomNote } from "@/lib/rooms/addRoomNote";

/** Cross-department per-room notes: every authenticated role may read & add. */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const notes = await prisma.roomNote.findMany({
    where: { roomId: id },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, role: true } } },
  });
  return NextResponse.json({ notes });
}

const NoteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = NoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Note body required." }, { status: 400 });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const note = await addRoomNote(id, room.number, parsed.data.body, {
    type: "staff",
    userId: auth.session.userId,
  });
  return NextResponse.json({ note }, { status: 201 });
}
