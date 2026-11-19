import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";

/**
 * PATCH /api/guest-requests/[id] — supervisor assigns and/or updates the
 * status of a guest request (Prompt G2 Teil 4: "zuweisen, als erledigt
 * markieren"). Either field alone is a valid call (e.g. "claim this" without
 * changing status, or "mark done" without reassigning). The guest's own
 * status feed (src/lib/guestStatusFeed.ts, polled from the guest screen)
 * picks up the new status on its next poll — this is the write side of
 * "jede Antwort/Erledigung wird dem Gast als Status angezeigt".
 */
const Body = z
  .object({
    status: z.enum(["RECEIVED", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
    assignedToId: z.string().nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.assignedToId !== undefined, {
    message: "Provide status and/or assignedToId.",
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // F3 Teil 2 (Annahme, nicht entschieden): Front Office darf ein „Bitte nicht stören“ des Gastes aufheben — nur das (DND → DONE)
  const auth = await requireRole(["supervisor", "front_office"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const existing = await prisma.guestRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Guest request not found." }, { status: 404 });
  // F7: archivierter Wunsch eines früheren Aufenthalts wird nicht wieder geöffnet
  if (existing.archivedAt) return NextResponse.json({ error: "Wunsch gehört zu einem abgereisten Aufenthalt.", code: "ARCHIVED" }, { status: 409 });
  const foLiftsDnd = auth.session.role === "front_office";
  if (foLiftsDnd && (existing.kind !== "DND" || parsed.data.status !== "DONE" || parsed.data.assignedToId !== undefined)) {
    return NextResponse.json({ error: "Front Office may only lift a guest's Do Not Disturb.", code: "FORBIDDEN" }, { status: 403 });
  }

  if (parsed.data.assignedToId != null) {
    const assignee = await prisma.user.findUnique({ where: { id: parsed.data.assignedToId } });
    if (!assignee) return NextResponse.json({ error: "assignedToId must reference a real user." }, { status: 400 });
  }

  const updated = await prisma.guestRequest.update({
    where: { id },
    data: {
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      ...(parsed.data.assignedToId !== undefined && { assignedToId: parsed.data.assignedToId }),
    },
    include: {
      room: { select: { id: true, number: true, floor: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  await audit({
    action: foLiftsDnd ? "GUEST_DND_LIFTED" : "GUEST_REQUEST_UPDATED",
    userId: auth.session.userId,
    roomId: existing.roomId,
    fromStatus: existing.status,
    toStatus: parsed.data.status ?? existing.status,
    meta: { assignedToId: parsed.data.assignedToId },
  });
  broadcast("guestrequest:update", { guestRequest: updated });
  if (existing.kind === "DND" && parsed.data.status === "DONE" && existing.status !== "DONE") {
    await notifyHousekeeperOfRoomChange({ roomId: existing.roomId, kind: "DND_ENDED", actorId: auth.session.userId }).catch(() => null);
  }

  return NextResponse.json({ guestRequest: updated });
}
