import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { minutesBetween, type DeferredRoomRef, type HandoverFacts, type RoomRef } from "@/lib/handover/collectFacts";
import { activeProvider, generateHandover } from "@/lib/handover/generate";

/**
 * GET /api/handover?hours=8 — the shift handover.
 *
 * Every number below is computed here from the board and the audit log. The
 * writer (deterministic or model) only receives the finished facts.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const hours = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("hours")) || 8));
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3600_000);

  const rooms = await prisma.room.findMany({
    orderBy: { number: "asc" },
    include: {
      assignedTo: { select: { name: true } },
      arrivals: { where: { status: "EXPECTED" } },
    },
  });

  const toRef = (r: (typeof rooms)[number]): RoomRef => ({
    number: r.number,
    floor: r.floor,
    status: r.status,
    minutesInStatus: minutesBetween(r.statusSince, now),
    blockReason: r.blockReason,
    reworkNote: r.reworkNote,
    assignedTo: r.assignedTo?.name ?? null,
  });

  const sellable = rooms.filter((r) => !["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status));
  const released = rooms.filter((r) => r.status === "INSPECTED");
  const waiting = rooms.filter((r) => r.status === "CLEAN");

  // --- Audit-log activity over the window ---------------------------------
  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    include: { user: { select: { name: true, role: true } } },
  });
  const statusChanges = logs.filter((l) => l.action === "STATUS_CHANGE");
  const perAttendant = new Map<string, number>();
  for (const l of statusChanges) {
    if (l.toStatus !== "CLEAN" || l.user?.role !== "room_attendant" || !l.user.name) continue;
    perAttendant.set(l.user.name, (perAttendant.get(l.user.name) ?? 0) + 1);
  }

  // --- Arrivals ------------------------------------------------------------
  const arrivals = await prisma.arrival.findMany({
    where: { status: "EXPECTED" },
    include: { room: { select: { number: true, status: true } } },
    orderBy: { eta: "asc" },
  });
  const hhmm = (d: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const notReady = arrivals.filter((a) => a.room.status !== "INSPECTED");

  // --- Engineering ---------------------------------------------------------
  const workOrders = await prisma.workOrder.findMany({
    include: { defect: { include: { room: { select: { number: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const openWorkOrders = workOrders.filter((w) => w.status !== "RESOLVED");

  const notes = await prisma.roomNote.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { room: { select: { number: true } }, author: { select: { name: true, role: true } } },
  });

  const facts: HandoverFacts = {
    generatedAt: now,
    windowHours: hours,
    progress: {
      totalRooms: rooms.length,
      released: released.length,
      sellable: sellable.length,
      percentReleased: sellable.length ? Math.round((released.length / sellable.length) * 100) : 0,
      stillDirty: rooms.filter((r) => r.status === "DIRTY").length,
      inProgress: rooms.filter((r) => r.status === "IN_PROGRESS").length,
      waitingForInspection: waiting.length,
    },
    attention: {
      blocked: rooms.filter((r) => r.status === "BLOCKED").map(toRef),
      rework: rooms.filter((r) => r.status === "PICKUP").map(toRef),
      outOfOrder: rooms.filter((r) => ["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status)).map(toRef),
      longestWaitingForInspection: waiting
        .map(toRef)
        .sort((a, b) => b.minutesInStatus - a.minutesInStatus)
        .slice(0, 3),
      deferred: rooms
        .filter((r) => r.deferredSince)
        .map((r): DeferredRoomRef => ({ ...toRef(r), deferredMinutesAgo: minutesBetween(r.deferredSince!, now) }))
        .sort((a, b) => b.deferredMinutesAgo - a.deferredMinutesAgo),
    },
    arrivals: {
      expected: arrivals.length,
      readyNow: arrivals.length - notReady.length,
      vipPending: notReady
        .filter((a) => a.vip)
        .map((a) => ({ room: a.room.number, guest: a.guestName, eta: hhmm(a.eta) })),
      // "At risk" = the room is not released and the guest is due within two hours.
      atRisk: notReady
        .filter((a) => a.eta && a.eta.getTime() - now.getTime() < 2 * 3600_000)
        .map((a) => ({ room: a.room.number, guest: a.guestName, eta: hhmm(a.eta), status: a.room.status })),
    },
    engineering: {
      openWorkOrders: openWorkOrders.length,
      unacknowledged: workOrders.filter((w) => w.status === "OPEN").length,
      resolvedInWindow: workOrders.filter((w) => w.resolvedAt && w.resolvedAt >= since).length,
      open: openWorkOrders.slice(0, 6).map((w) => ({
        room: w.defect.room.number,
        category: w.defect.category,
        note: w.defect.note,
        status: w.status,
      })),
    },
    activity: {
      statusChanges: statusChanges.length,
      roomsReleasedInWindow: statusChanges.filter((l) => l.toStatus === "INSPECTED").length,
      deniedAttempts: logs.filter((l) => l.action === "STATUS_CHANGE_DENIED").length,
      byAttendant: [...perAttendant.entries()]
        .map(([name, count]) => ({ name, rooms: count }))
        .sort((a, b) => b.rooms - a.rooms || a.name.localeCompare(b.name)),
    },
    notes: notes.map((n) => ({
      room: n.room.number,
      author: n.author.name,
      role: n.author.role,
      body: n.body,
    })),
  };

  const result = await generateHandover(facts);
  await audit({
    action: "HANDOVER_GENERATED",
    userId: auth.session.userId,
    meta: { provider: result.provider, model: result.model, windowHours: hours },
  });

  return NextResponse.json({ handover: result, facts, providerAvailable: activeProvider() });
}
