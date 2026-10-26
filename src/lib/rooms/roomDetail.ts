import { prisma } from "@/lib/db";
import { berlinToday } from "@/lib/import/businessDay";
import { loadRoomRows } from "@/lib/lists/dayRows";
import { assignedToday, hubDay } from "@/lib/dayplan/hubDay";
import { ROOM_STATUSES, type RoomStatus } from "@/lib/domain";
import { checkTransition } from "@/lib/stateMachine";

/** Status, die das Detail-Modal von sich aus anbietet. Gesperrt/Nacharbeit/Mangel haben eigene Wege (DND-Knopf, Mängelmeldung). */
const OFFERED: RoomStatus[] = ["DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "GREEN_OPT_OUT", "OUT_OF_SERVICE", "OUT_OF_ORDER"];

export interface RoomDetail {
  id: string; number: string; floor: number; section: string; type: string;
  status: RoomStatus; blockReason: string | null; oooUntil: string | null; reworkNote: string | null; occupancy: string | null;
  isCheckoutToday: boolean;
  assignedTo: { id: string; name: string; dailyNumber: number | null } | null;
  /** Tagesplan-Infos (nur wenn es einen Plan für heute gibt). */
  day: { kind: string | null; laundry: boolean; vip: boolean; eta: string | null; guest: string | null; pax: number | null; credits: number } | null;
  guestDndActive: boolean;
  traces: { id: string; code: string; text: string; dept: string; status: string; doneAt: string | null }[];
  notes: { id: string; body: string; status: "OPEN" | "DONE"; author: { name: string; role: string }; createdAt: string; roomId: string }[];
  defects: { id: string; category: string; note: string; workOrder: { status: string } | null; reportedBy: { name: string; role: string } | null }[];
  guestRequests: { id: string; kind: string; detail: string | null; status: string; createdAt: string }[];
  /** Zimmer-Logbuch: letzte Änderungen an diesem Zimmer (nie Texte, nur Art + Zeit + Person). */
  logbook: { id: string; action: string; at: string; by: string | null; from: string | null; to: string | null }[];
  allowedStatuses: RoomStatus[];
  /** Bitte-nicht-stören (Sperre mit Grund DND) ist von diesem Status aus erlaubt. */
  canBlock: boolean;
  attendants: { id: string; name: string; dailyNumber: number | null }[];
}

/**
 * Alles, was das Zimmer-Detail-Modal für Duty Manager/Supervisor braucht — eine Abfrage. `idOrNumber` darf die Zimmer-Id
 * oder die Zimmernummer sein (Hausmann-Liste kennt nur die Nummer). Gast nur als Kurzname, keine Altersangaben.
 */
export async function getRoomDetail(idOrNumber: string, role: string): Promise<RoomDetail | null> {
  const room = await prisma.room.findFirst({
    where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] },
    include: { assignedTo: { select: { id: true, name: true, dailyNumber: true } } },
  });
  if (!room) return null;
  const today = berlinToday();
  const hub = await hubDay();
  const date = hub.ready ? hub.date : null;
  const [rows, traces, notes, defects, guestRequests, audits, attendants] = await Promise.all([
    date ? loadRoomRows(date, { roomIds: [room.id] }, null) : Promise.resolve([]),
    prisma.trace.findMany({ where: { roomId: room.id, date: today }, orderBy: { createdAt: "asc" } }),
    prisma.roomNote.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { name: true, role: true } } } }),
    prisma.defect.findMany({ where: { roomId: room.id }, include: { workOrder: true, reportedBy: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.guestRequest.findMany({ where: { roomId: room.id, status: { in: ["RECEIVED", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.auditLog.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, select: { id: true, name: true, dailyNumber: true }, orderBy: { name: "asc" } }),
  ]);
  const userIds = [...new Set(audits.map((a) => a.userId).filter((x): x is string => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const row = rows[0];
  const hubReady = !!date;
  const assigned = hubReady && assignedToday(room.assignedOn, today) ? room.assignedTo : null;
  return {
    id: room.id, number: room.number, floor: room.floor, section: room.section, type: room.type,
    status: room.status as RoomStatus, blockReason: room.blockReason, oooUntil: room.oooUntil?.toISOString() ?? null,
    reworkNote: room.reworkNote, occupancy: room.occupancy, isCheckoutToday: hubReady && room.isCheckoutToday,
    assignedTo: assigned,
    day: row && row.kind ? { kind: row.kind, laundry: row.laundry, vip: row.vip, eta: row.eta, guest: row.guest, pax: row.pax, credits: row.credits } : null,
    guestDndActive: guestRequests.some((g) => g.kind === "DND"),
    traces: traces.map((t) => ({ id: t.id, code: t.code, text: t.text, dept: t.dept, status: t.status, doneAt: t.doneAt?.toISOString() ?? null })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, status: n.status as "OPEN" | "DONE", author: n.author, createdAt: n.createdAt.toISOString(), roomId: n.roomId })),
    defects: defects.map((d) => ({ id: d.id, category: d.category, note: d.note, workOrder: d.workOrder ? { status: d.workOrder.status } : null, reportedBy: d.reportedBy })),
    guestRequests: guestRequests.map((g) => ({ id: g.id, kind: g.kind, detail: g.detail, status: g.status, createdAt: g.createdAt.toISOString() })),
    logbook: audits.map((a) => ({ id: a.id, action: a.action, at: a.createdAt.toISOString(), by: a.userId ? users.get(a.userId) ?? null : null, from: a.fromStatus, to: a.toStatus })),
    allowedStatuses: OFFERED.filter((s) => ROOM_STATUSES.includes(s) && checkTransition(role as never, room.status as RoomStatus, s).ok),
    canBlock: checkTransition(role as never, room.status as RoomStatus, "BLOCKED").ok,
    attendants,
  };
}
