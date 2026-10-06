import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { prisma } from "@/lib/db";
import { setHousemanTraceStatus } from "@/lib/lists/housemanList";

const Body = z.object({ status: z.enum(["OPEN", "DONE"]) }).strict();

/**
 * PATCH /api/traces/[id] — Hausmann-Trace abhaken (oder wieder öffnen). Speichert Zeitstempel (`doneAt`) und
 * schreibt den Nutzer ins Logbuch (AuditLog, ohne Trace-Text). Nur Traces der Abteilung Hausmann.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["houseman", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });

  const r = await setHousemanTraceStatus(id, parsed.data.status, auth.session);
  if (!r) return NextResponse.json({ error: "Aufgabe nicht gefunden." }, { status: 404 });
  if (r.changed) {
    const room = await prisma.room.findUnique({ where: { number: r.roomNumber }, select: { id: true } });
    await audit({ action: parsed.data.status === "DONE" ? "TRACE_DONE" : "TRACE_REOPENED", userId: auth.session.userId, roomId: room?.id, meta: { traceId: id } });
    broadcast("trace:update", { trace: { id, status: r.trace.status, doneAt: r.trace.doneAt?.toISOString() ?? null, roomNumber: r.roomNumber } });
    if (r.roomTaskId) {
      const roomTask = await prisma.roomTask.findUnique({ where: { id: r.roomTaskId }, include: { room: { select: { id: true, number: true, floor: true } }, createdBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } } } });
      if (roomTask) broadcast("roomtask:update", { roomTask });
    }
  }
  return NextResponse.json({ trace: { id, status: r.trace.status, doneAt: r.trace.doneAt?.toISOString() ?? null } });
}
