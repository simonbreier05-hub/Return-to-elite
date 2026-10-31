import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { parseAssignedFloors } from "@/lib/floors";
import { keyed } from "@/lib/i18n/notificationText";

/**
 * Meldungen, wenn ein Zimmer einer anderen Kraft zugeteilt wird (Verschieben, Zuteilen, Zuteilung entfernen) — auch über Etagen hinweg.
 * Gemeldet wird: dem neuen Zimmermädchen, dem bisherigen Zimmermädchen und den Supervisoren, die für die Etage des Zimmers
 * oder für die Etagen des neuen Zimmermädchens zuständig sind (außer dem, der es selbst getan hat).
 * Zimmermädchen erfahren nur Zimmer und Etage (keine Namen Dritter); die Supervisoren sehen zusätzlich, wer von wem zu wem verschoben hat.
 * Nie Gastdaten, nie Typ/Stufe.
 */
export async function notifyReassignment(opts: {
  room: { id: string; number: string; floor: number };
  fromId: string | null;
  toId: string | null;
  actorId: string;
}): Promise<number> {
  const { room, fromId, toId, actorId } = opts;
  if (fromId === toId) return 0;
  const people = await prisma.user.findMany({ where: { id: { in: [fromId, toId, actorId].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const where = `Zimmer ${room.number} (Etage ${room.floor})`;
  const out: { type: string; level: string; targetRole: string; targetUserId: string; roomId: string; message: string; messageKey: string; messageVars: string }[] = [];
  const add = (type: string, targetRole: string, targetUserId: string, message: string, k: ReturnType<typeof keyed>, level = "info") =>
    out.push({ type, level, targetRole, targetUserId, roomId: room.id, message, ...k });
  const at = { n: room.number, floor: room.floor };

  if (toId) add("ROOM_ASSIGNED", "room_attendant", toId, `${where} wurde dir zugeteilt.`, keyed("notify.roomAssignedToYou", at));
  if (fromId) add("ROOM_UNASSIGNED", "room_attendant", fromId, `${where} wurde von deiner Liste genommen.`, keyed("notify.roomRemovedFromYou", at));

  // Zuständige Supervisoren: für die Etage des Zimmers und für die Etagen, auf denen das neue Zimmermädchen heute arbeitet
  const floors = new Set<number>([room.floor]);
  if (toId) for (const r of await prisma.room.findMany({ where: { assignedToId: toId, id: { not: room.id } }, select: { floor: true } })) floors.add(r.floor);
  const sups = await prisma.user.findMany({ where: { role: "supervisor", id: { not: actorId } }, select: { id: true, assignedFloors: true } });
  const move = fromId && toId ? `von ${name(fromId)} zu ${name(toId)}` : toId ? `an ${name(toId)}` : `von ${name(fromId)} entfernt`;
  for (const s of sups) {
    if (!parseAssignedFloors(s.assignedFloors).some((f) => floors.has(f))) continue;
    const k = fromId && toId
      ? keyed("notify.movedFromTo", { ...at, from: name(fromId), to: name(toId), actor: name(actorId) })
      : toId ? keyed("notify.movedTo", { ...at, to: name(toId), actor: name(actorId) }) : keyed("notify.movedRemoved", { ...at, from: name(fromId), actor: name(actorId) });
    add("ROOM_MOVED", "supervisor", s.id, `${where} wurde ${move} verschoben — durch ${name(actorId)}.`, k, "warning");
  }

  for (const data of out) {
    const notification = await prisma.notification.create({ data });
    broadcast("notification:new", { notification });
  }
  return out.length;
}
