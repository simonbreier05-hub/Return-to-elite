import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { parseAssignedFloors } from "@/lib/floors";
import { keyed } from "@/lib/i18n/notificationText";

/**
 * Meldungen für eine gebündelte Zuteilung (mehrere Zimmer auf einmal): je Person genau eine Meldung, nicht eine je Zimmer.
 * Neue Kraft: „N Zimmer wurden dir zugeteilt"; bisherige Kräfte: „N Zimmer wurden von deiner Liste genommen";
 * zuständige Supervisoren: eine Zusammenfassung. Wer es selbst tut, wird nicht gemeldet. Nie Gastdaten.
 */
export async function notifyBulkReassignment(opts: {
  rooms: { id: string; number: string; floor: number; fromId: string | null }[];
  toId: string | null;
  actorId: string;
}): Promise<number> {
  const { toId, actorId } = opts;
  const rooms = opts.rooms.filter((r) => r.fromId !== toId);
  if (!rooms.length) return 0;
  const people = await prisma.user.findMany({ where: { id: { in: [toId, actorId, ...rooms.map((r) => r.fromId)].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const list = (rs: { number: string }[]) => rs.map((r) => r.number).sort().join(", ");
  const n = (k: number) => (k === 1 ? "1 Zimmer" : `${k} Zimmer`);
  const out: { type: string; level: string; targetRole: string; targetUserId: string; message: string; messageKey: string; messageVars: string }[] = [];
  const add = (type: string, targetRole: string, targetUserId: string, message: string, k: ReturnType<typeof keyed>, level = "info") => out.push({ type, level, targetRole, targetUserId, message, ...k });

  if (toId && toId !== actorId) add("ROOM_ASSIGNED", "room_attendant", toId, `${n(rooms.length)} ${rooms.length === 1 ? "wurde" : "wurden"} dir zugeteilt: ${list(rooms)}.`, keyed("notify.bulkAssigned", { count: rooms.length, rooms: list(rooms) }));
  const byFrom = new Map<string, typeof rooms>();
  for (const r of rooms) if (r.fromId) byFrom.set(r.fromId, [...(byFrom.get(r.fromId) ?? []), r]);
  for (const [from, rs] of byFrom) if (from !== actorId) add("ROOM_UNASSIGNED", "room_attendant", from, `${n(rs.length)} ${rs.length === 1 ? "wurde" : "wurden"} von deiner Liste genommen: ${list(rs)}.`, keyed("notify.bulkRemoved", { count: rs.length, rooms: list(rs) }));

  const floors = new Set<number>(rooms.map((r) => r.floor));
  if (toId) for (const r of await prisma.room.findMany({ where: { assignedToId: toId, id: { notIn: rooms.map((x) => x.id) } }, select: { floor: true } })) floors.add(r.floor);
  const sups = await prisma.user.findMany({ where: { role: "supervisor", id: { not: actorId } }, select: { id: true, assignedFloors: true } });
  for (const s of sups) {
    if (!parseAssignedFloors(s.assignedFloors).some((f) => floors.has(f))) continue;
    add("ROOM_MOVED", "supervisor", s.id, `${n(rooms.length)} ${toId ? `an ${name(toId)} zugeteilt` : "von der Liste genommen"} (${list(rooms)}) — durch ${name(actorId)}.`,
      toId ? keyed("notify.bulkMovedTo", { count: rooms.length, to: name(toId), rooms: list(rooms), actor: name(actorId) }) : keyed("notify.bulkMovedOff", { count: rooms.length, rooms: list(rooms), actor: name(actorId) }), "warning");
  }
  for (const data of out) {
    const notification = await prisma.notification.create({ data });
    broadcast("notification:new", { notification });
  }
  return out.length;
}
