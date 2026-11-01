import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";
import { audit } from "@/lib/audit";
import { NoteStatusSchema } from "@/lib/domain";

/** Toggle a single note's OPEN/DONE state. Cross-department, same as GET/POST on the parent route. */

const PatchSchema = z.object({ status: NoteStatusSchema.optional(), body: z.string().trim().min(1).max(1000).optional() }).refine((b) => b.status !== undefined || b.body !== undefined);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, noteId } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Valid status required.", code: "INVALID_STATUS" }, { status: 400 });

  const existing = await prisma.roomNote.findUnique({ where: { id: noteId } });
  if (!existing || existing.roomId !== id) return NextResponse.json({ error: "Note not found.", code: "NOTE_NOT_FOUND" }, { status: 404 });

  // Den Text ändern dürfen nur Supervisor/Duty Manager (Status abhaken darf jeder angemeldete Mitarbeiter wie bisher)
  if (parsed.data.body !== undefined && auth.session.role !== "supervisor" && auth.session.role !== "duty_manager") {
    return NextResponse.json({ error: "Nur Supervisor oder Duty Manager dürfen eine Notiz ändern.", code: "NO_PERMISSION" }, { status: 403 });
  }
  const note = await prisma.roomNote.update({
    where: { id: noteId },
    data: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}) },
    include: { author: { select: { name: true, role: true } } },
  });
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    await audit({
      action: "NOTE_STATUS_CHANGED",
      userId: auth.session.userId,
      roomId: id,
      fromStatus: existing.status,
      toStatus: parsed.data.status,
    });
  }
  if (parsed.data.body !== undefined && parsed.data.body !== existing.body) {
    await audit({ action: "NOTE_EDITED", userId: auth.session.userId, roomId: id, meta: { noteId } }); // ohne Text
  }
  broadcast("note:update", { note });
  return NextResponse.json({ note });
}
