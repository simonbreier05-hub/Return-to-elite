import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { getSettings } from "@/lib/settings";
import { endPauseOnChange } from "@/lib/work/pauseData";
import type { Session } from "@/lib/auth";
import { rewindOption, type LastStatusEntry } from "./rewind";

/** Letzter Statusschritt je Zimmer (STATUS_CHANGE oder STATUS_REWIND) — Grundlage für `rewindOption`. */
async function lastEntries(roomIds: string[], since: Date): Promise<Map<string, LastStatusEntry>> {
  const rows = await prisma.auditLog.findMany({
    where: { roomId: { in: roomIds }, action: { in: ["STATUS_CHANGE", "STATUS_REWIND"] }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { roomId: true, action: true, userId: true, fromStatus: true, toStatus: true, createdAt: true },
  });
  const out = new Map<string, LastStatusEntry>();
  for (const r of rows) if (r.roomId && !out.has(r.roomId)) out.set(r.roomId, { action: r.action, userId: r.userId, fromStatus: r.fromStatus, toStatus: r.toStatus, at: r.createdAt });
  return out;
}

/** Für „Meine Zimmer“: welches eigene Zimmer lässt sich gerade zurückspulen (und bis wann)? */
export async function rewindOptions(session: Session, rooms: { id: string; status: string; assignedToId: string | null; assignedOn: string | null }[], now = new Date()) {
  const out = new Map<string, { to: string; until: string }>();
  if (session.role !== "room_attendant" || !rooms.length) return out;
  const { statusRewindMinutes } = await getSettings();
  if (statusRewindMinutes <= 0) return out;
  const last = await lastEntries(rooms.map((r) => r.id), new Date(now.getTime() - statusRewindMinutes * 60_000));
  const today = berlinDate(now);
  for (const room of rooms) {
    const opt = rewindOption({ role: session.role, userId: session.userId, room, today, last: last.get(room.id) ?? null, now, limitMinutes: statusRewindMinutes });
    if (opt) out.set(room.id, opt);
  }
  return out;
}

export type RewindResult = { ok: true; room: unknown } | { ok: false; status: number; error: string };

/** Spult den eigenen letzten Statusschritt eine Stufe zurück — protokolliert als STATUS_REWIND, live als room:update. */
export async function rewindRoomStatus(session: Session, roomId: string, now = new Date()): Promise<RewindResult> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, status: 404, error: "Zimmer nicht gefunden." };
  const opt = (await rewindOptions(session, [room], now)).get(room.id);
  if (!opt) {
    await audit({ action: "STATUS_REWIND_DENIED", userId: session.userId, roomId: room.id, fromStatus: room.status, meta: { role: session.role } });
    return { ok: false, status: 409, error: "Zurückspulen ist hier nicht (mehr) möglich." };
  }
  const updated = await prisma.room.update({
    where: { id: room.id },
    data: { status: opt.to, statusSince: now },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  await audit({ action: "STATUS_REWIND", userId: session.userId, roomId: room.id, fromStatus: room.status, toStatus: opt.to, meta: { role: session.role } });
  await endPauseOnChange("ROOM", room.id, session.userId, room.id, room.number);
  broadcast("room:update", { room: updated });
  broadcast("room:status", { roomId: room.id, number: room.number, from: room.status, to: opt.to, by: session.name });
  return { ok: true, room: updated };
}
