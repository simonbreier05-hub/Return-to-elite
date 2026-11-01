import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinToday } from "@/lib/import/businessDay";
import { traceKey } from "@/lib/dayplan/traceKey";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";

const Body = z.object({ text: z.string().trim().min(1).max(300), dept: z.enum(["HOUSEKEEPING", "HOUSEMAN", "ENGINEERING", "FRONT_OFFICE"]) }).strict();

/**
 * POST /api/rooms/[id]/traces — Trace von Hand hinzufügen (heute). Nur Supervisor/Duty Manager.
 * Logbuch ohne Text; Live-Meldung ohne Text (nur Zimmernummer).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte einen Text (bis 300 Zeichen) und eine Abteilung angeben.", code: "TEXT_AND_DEPARTMENT_REQUIRED" }, { status: 400 });
  const room = await prisma.room.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!room) return NextResponse.json({ error: "Zimmer nicht gefunden.", code: "ROOM_NOT_FOUND" }, { status: 404 });
  const date = berlinToday();
  const dedupeKey = traceKey(room.number, "MAN", date, parsed.data.text);
  if (await prisma.trace.findUnique({ where: { dedupeKey } })) return NextResponse.json({ error: "Diesen Trace gibt es heute schon.", code: "DUPLICATE" }, { status: 409 });
  const trace = await prisma.trace.create({ data: { roomId: room.id, code: "MAN", date, text: parsed.data.text, dept: parsed.data.dept, source: "MANUAL", dedupeKey } });
  await audit({ action: "TRACE_ADDED", userId: auth.session.userId, roomId: room.id, meta: { traceId: trace.id, dept: trace.dept } });
  broadcast("trace:update", { roomNumber: room.number, traceId: trace.id });
  if (trace.dept === "HOUSEKEEPING") await notifyHousekeeperOfRoomChange({ roomId: room.id, kind: "TRACE", actorId: auth.session.userId });
  return NextResponse.json({ trace: { id: trace.id, code: trace.code, text: trace.text, dept: trace.dept, status: trace.status, doneAt: null } }, { status: 201 });
}
