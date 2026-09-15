import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";
import { audit } from "@/lib/audit";
import { NoteStatusSchema } from "@/lib/domain";

/** Toggle a single note's OPEN/DONE state. Cross-department, same as GET/POST on the parent route. */

const PatchSchema = z.object({ status: NoteStatusSchema });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, noteId } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Valid status required." }, { status: 400 });

  const existing = await prisma.roomNote.findUnique({ where: { id: noteId } });
  if (!existing || existing.roomId !== id) return NextResponse.json({ error: "Note not found." }, { status: 404 });

  const note = await prisma.roomNote.update({
    where: { id: noteId },
    data: { status: parsed.data.status },
    include: { author: { select: { name: true, role: true } } },
  });
  await audit({
    action: "NOTE_STATUS_CHANGED",
    userId: auth.session.userId,
    roomId: id,
    fromStatus: existing.status,
    toStatus: parsed.data.status,
  });
  broadcast("note:update", { note });
  return NextResponse.json({ note });
}
