import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { setHousemanTraceStatus } from "@/lib/lists/housemanList";
import { notifyTaskDone } from "@/lib/rooms/notifyTaskDone";
import { traceKey } from "@/lib/dayplan/traceKey";

const Body = z.object({ text: z.string().trim().min(1).max(300).optional(), status: z.enum(["OPEN", "DONE"]).optional() }).strict()
  .refine((b) => b.text !== undefined || b.status !== undefined);

/**
 * PATCH /api/rooms/[id]/traces/[traceId] — Trace-Text ändern und/oder erledigen/wieder öffnen (alle Abteilungen).
 * Nur Supervisor/Duty Manager. Hausmann-Traces ziehen ihre Hausmann-Aufgabe mit (wie PATCH /api/traces/[id]).
 * Logbuch ohne Text; Live-Meldung ohne Text.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; traceId: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id, traceId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Text oder Status angeben." }, { status: 400 });
  const trace = await prisma.trace.findUnique({ where: { id: traceId }, include: { room: { select: { id: true, number: true, floor: true } } } });
  if (!trace || trace.roomId !== id) return NextResponse.json({ error: "Trace nicht gefunden." }, { status: 404 });

  if (parsed.data.text !== undefined && parsed.data.text !== trace.text) {
    const dedupeKey = traceKey(trace.room.number, trace.code, trace.date, parsed.data.text);
    if (await prisma.trace.findFirst({ where: { dedupeKey, NOT: { id: trace.id } } })) return NextResponse.json({ error: "Diesen Trace gibt es schon." }, { status: 409 });
    // Neuer Schlüssel: ein späterer Import legt den Original-Trace sonst als zweiten Eintrag neu an
    await prisma.trace.update({ where: { id: trace.id }, data: { text: parsed.data.text, dedupeKey } });
    await audit({ action: "TRACE_EDITED", userId: auth.session.userId, roomId: trace.roomId, meta: { traceId } });
  }
  if (parsed.data.status !== undefined && parsed.data.status !== trace.status) {
    const status = parsed.data.status;
    if (trace.dept === "HOUSEMAN") {
      await setHousemanTraceStatus(traceId, status, auth.session);
      await notifyTaskDone({ room: trace.room, actorId: auth.session.userId, done: status === "DONE" });
    } else {
      await prisma.trace.update({ where: { id: traceId }, data: { status, doneAt: status === "DONE" ? new Date() : null } });
    }
    await audit({ action: status === "DONE" ? "TRACE_DONE" : "TRACE_REOPENED", userId: auth.session.userId, roomId: trace.roomId, meta: { traceId } });
  }
  const fresh = await prisma.trace.findUnique({ where: { id: traceId } });
  broadcast("trace:update", { roomNumber: trace.room.number, traceId });
  return NextResponse.json({ trace: fresh && { id: fresh.id, code: fresh.code, text: fresh.text, dept: fresh.dept, status: fresh.status, doneAt: fresh.doneAt?.toISOString() ?? null } });
}
