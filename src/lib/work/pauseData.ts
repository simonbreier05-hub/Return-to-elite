import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { parseAssignedFloors } from "@/lib/floors";
import type { PauseReason, PauseTarget } from "@/lib/domain";
import type { Session } from "@/lib/auth";
import { checkPause, type Viewer, type WorkTarget } from "./access";

/**
 * Pausieren/Fortsetzen für alle Abteilungen (Tabelle WorkPause). Ändert nie den Status der Aufgabe selbst; jede Pause und
 * jedes Fortsetzen steht im Zimmer-Logbuch (AuditLog WORK_PAUSED/WORK_RESUMED, nur Codes, nie Text) und geht live als
 * `work:pause` an alle Bildschirme.
 */

export interface PauseView { reason: string | null; since: string; byName: string | null; byRole: string | null }

/** Die aktuelle Person als Viewer (Supervisor mit ihren Etagen; ohne Etagen: ganzes Haus wie das Live-Board). */
export async function viewerFor(session: { role: string; userId: string }): Promise<Viewer> {
  if (session.role !== "supervisor") return { role: session.role, userId: session.userId, floors: null };
  const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { assignedFloors: true } });
  const floors = parseAssignedFloors(u?.assignedFloors);
  return { role: session.role, userId: session.userId, floors: floors.length ? floors : null };
}

type Loaded = WorkTarget & { roomId: string; roomNumber: string };

/** Lädt die Aufgabe so, wie die Regeln (`checkPause`) sie brauchen. */
export async function loadWorkTarget(type: PauseTarget, id: string, now = new Date()): Promise<Loaded | null> {
  const room = { select: { id: true, number: true, floor: true } } as const;
  switch (type) {
    case "ROOM": {
      const r = await prisma.room.findUnique({ where: { id } });
      if (!r) return null;
      const today = berlinDate(now);
      return { type, floor: r.floor, assigneeId: r.assignedOn === today ? r.assignedToId : null, done: r.status === "CLEAN" || r.status === "INSPECTED", started: r.status === "IN_PROGRESS", roomId: r.id, roomNumber: r.number };
    }
    case "ROOMTASK": {
      const t = await prisma.roomTask.findUnique({ where: { id }, include: { room } });
      return t && { type, floor: t.room.floor, assigneeId: t.assignedToId, done: t.status === "DONE", roomId: t.room.id, roomNumber: t.room.number };
    }
    case "TRACE": {
      const t = await prisma.trace.findUnique({ where: { id }, include: { room } });
      return t && { type, floor: t.room.floor, assigneeId: t.assignedToId, done: t.status === "DONE", dept: t.dept, roomId: t.room.id, roomNumber: t.room.number };
    }
    case "WORKORDER": {
      const w = await prisma.workOrder.findUnique({ where: { id }, include: { defect: { include: { room } } } });
      return w && { type, floor: w.defect.room.floor, assigneeId: w.assignedToId, done: w.status === "RESOLVED", roomId: w.defect.room.id, roomNumber: w.defect.room.number };
    }
  }
}

/** Aktive Pausen für mehrere Aufgaben eines Typs (für Listen). */
export async function activePauses(type: PauseTarget, ids: string[]): Promise<Map<string, PauseView>> {
  if (!ids.length) return new Map();
  const rows = await prisma.workPause.findMany({ where: { targetType: type, targetId: { in: ids }, resumedAt: null }, orderBy: { pausedAt: "desc" } });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.pausedById))] } }, select: { id: true, name: true, role: true } })).map((u) => [u.id, u]));
  const out = new Map<string, PauseView>();
  for (const p of rows) {
    if (out.has(p.targetId)) continue;
    const u = users.get(p.pausedById);
    out.set(p.targetId, { reason: p.reason, since: p.pausedAt.toISOString(), byName: u?.name ?? null, byRole: u?.role ?? null });
  }
  return out;
}

export type PauseResult = { ok: true; paused: boolean; pause: PauseView | null } | { ok: false; status: number; error: string };

export async function setPause(session: Session, type: PauseTarget, id: string, action: "pause" | "resume", reason?: PauseReason | null): Promise<PauseResult> {
  const target = await loadWorkTarget(type, id);
  if (!target) return { ok: false, status: 404, error: "Aufgabe nicht gefunden." };
  const active = await prisma.workPause.findFirst({ where: { targetType: type, targetId: id, resumedAt: null } });
  const check = checkPause(await viewerFor(session), target, action, !!active);
  if (!check.ok) return check;
  const now = new Date();
  if (action === "pause") {
    await prisma.workPause.create({ data: { targetType: type, targetId: id, roomId: target.roomId, reason: reason ?? null, pausedById: session.userId, pausedAt: now } });
  } else {
    await prisma.workPause.updateMany({ where: { targetType: type, targetId: id, resumedAt: null }, data: { resumedAt: now, resumedById: session.userId } });
  }
  await audit({ action: action === "pause" ? "WORK_PAUSED" : "WORK_RESUMED", userId: session.userId, roomId: target.roomId, meta: { targetType: type, targetId: id, reason: action === "pause" ? reason ?? null : undefined, role: session.role } });
  const pause = action === "pause" ? { reason: reason ?? null, since: now.toISOString(), byName: session.name, byRole: session.role } : null;
  broadcast("work:pause", { targetType: type, targetId: id, roomId: target.roomId, roomNumber: target.roomNumber, paused: action === "pause", pause });
  return { ok: true, paused: action === "pause", pause };
}

/**
 * Beendet eine aktive Pause, wenn die Aufgabe anders weitergeht (Status geändert, erledigt) — eine Pause überdauert nie
 * den Zustand, für den sie gesetzt wurde. Ohne aktive Pause passiert nichts (keine Abfrage-Kette, kein Logbuch-Eintrag).
 */
export async function endPauseOnChange(type: PauseTarget, id: string, userId: string, roomId: string | null, roomNumber?: string): Promise<void> {
  const { count } = await prisma.workPause.updateMany({ where: { targetType: type, targetId: id, resumedAt: null }, data: { resumedAt: new Date(), resumedById: userId } });
  if (!count) return;
  await audit({ action: "WORK_RESUMED", userId, roomId, meta: { targetType: type, targetId: id, auto: true } });
  broadcast("work:pause", { targetType: type, targetId: id, roomId, roomNumber, paused: false, pause: null });
}
