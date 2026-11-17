import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { currentStayForRoom } from "@/lib/guestStay";
import { arrivalTodayWhere } from "@/lib/rooms/blockedRooms";
import { notifyFloorLeads } from "@/lib/rooms/notifyLeads";
import type { Session } from "@/lib/auth";

/**
 * F3 Teil 4 (Befund H9, Regel B5 neu, Entscheidung Frage 5): Zimmerwechsel in einem Schritt durch Front Office, Supervisor
 * oder Duty Manager — ohne zweite Freigabe. Keine Hausmann-Aufgabe, kein Gepäck (nicht Teil von StayClean).
 *
 *  - Ziel: frei, geprüft (INSPECTED), nicht gesperrt, keine Anreise heute, kein Aufenthalt „im Haus“ (`eligibleTargets`).
 *  - Der Aufenthalt wandert ins Zielzimmer: Der Gastcode des Zielzimmers zeigt ihn, der alte Code nichts mehr (S1, guestStay.ts).
 *  - Altes Zimmer: schmutzig, Art Abreise (Handeingabe), Kennzeichen „Zimmerwechsel → Ziel“ bis zur Freigabe.
 *    Zielzimmer: belegt, Bleiber, „von alt“ für den Tag.
 *  - Offene Gastwünsche wandern mit; Notizen zum alten Zimmer bleiben dort.
 *  - Meldungen: Housekeeperinnen beider Zimmer, Supervisoren der Etagen, Duty Manager, Front Office — nur Zimmernummern.
 */
export interface RoomChangeTarget { id: string; number: string; floor: number; type: string }

export async function eligibleTargets(now = new Date()): Promise<RoomChangeTarget[]> {
  const date = berlinDate(now);
  const [rooms, arrivals, plans, inHouse] = await Promise.all([
    prisma.room.findMany({ where: { active: true, occupancy: "VACANT", status: "INSPECTED" }, select: { id: true, number: true, floor: true, type: true }, orderBy: { number: "asc" } }),
    prisma.arrival.findMany({ where: arrivalTodayWhere(now), select: { roomId: true } }),
    prisma.dayRoomPlan.findMany({ where: { date, cleaningType: { in: ["ARRIVAL", "SAME_DAY_TURN", "STAYOVER"] } }, select: { roomId: true } }),
    prisma.stay.findMany({ where: { status: "IN_HOUSE" }, select: { roomId: true } }),
  ]);
  const busy = new Set([...arrivals, ...plans, ...inHouse].map((x) => x.roomId));
  return rooms.filter((r) => !busy.has(r.id));
}

export type RoomChangeResult = { ok: true; from: string; to: string } | { ok: false; status: number; code: string; error: string };

export async function changeRoom(session: Session, fromId: string, toId: string, reason: string, now = new Date()): Promise<RoomChangeResult> {
  const date = berlinDate(now);
  const [from, to] = await Promise.all([prisma.room.findUnique({ where: { id: fromId } }), prisma.room.findUnique({ where: { id: toId } })]);
  if (!from || !to) return { ok: false, status: 404, code: "ROOM_NOT_FOUND", error: "Zimmer nicht gefunden." };
  if (from.id === to.id) return { ok: false, status: 400, code: "SAME_ROOM", error: "Gleiches Zimmer." };
  const stay = await currentStayForRoom(from.id);
  if (!stay) return { ok: false, status: 409, code: "NO_GUEST_IN_ROOM", error: `In Zimmer ${from.number} ist gerade kein Gast „im Haus“.` };
  if (!(await eligibleTargets(now)).some((r) => r.id === to.id)) {
    return { ok: false, status: 409, code: "TARGET_NOT_AVAILABLE", error: `Zimmer ${to.number} ist nicht frei, nicht geprüft, gesperrt oder hat heute eine Anreise.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.stay.update({ where: { id: stay.id }, data: { roomId: to.id } });
    // Offene Gastwünsche wandern mit (Notizen zum alten Zimmer bleiben dort)
    await tx.guestRequest.updateMany({ where: { roomId: from.id, status: { in: ["RECEIVED", "IN_PROGRESS"] } }, data: { roomId: to.id } });
    // Altes Zimmer: Abreise (Handeingabe, der Import überschreibt sie nicht), Kennzeichen bis zur Freigabe
    const oldPlan = await tx.dayRoomPlan.findUnique({ where: { date_roomId: { date, roomId: from.id } } });
    const derived = oldPlan ? (oldPlan.typeOverridden ? oldPlan.derivedType : oldPlan.cleaningType) : null;
    await tx.dayRoomPlan.upsert({
      where: { date_roomId: { date, roomId: from.id } },
      create: { date, roomId: from.id, cleaningType: "DEPARTURE", typeOverridden: true, derivedType: null, roomChangeTo: to.number },
      update: { cleaningType: "DEPARTURE", typeOverridden: true, derivedType: derived, stayId: null, laundryDue: false, roomChangeTo: to.number },
    });
    await tx.room.update({ where: { id: from.id }, data: { status: "DIRTY", statusSince: now, occupancy: "VACANT", isCheckoutToday: true } });
    // Zielzimmer: belegt, Bleiber, „von alt“ für den Tag
    await tx.dayRoomPlan.upsert({
      where: { date_roomId: { date, roomId: to.id } },
      create: { date, roomId: to.id, cleaningType: "STAYOVER", typeOverridden: true, stayId: stay.id, roomChangeFrom: from.number },
      update: { cleaningType: "STAYOVER", typeOverridden: true, stayId: stay.id, arrivingStayId: null, roomChangeFrom: from.number },
    });
    await tx.room.update({ where: { id: to.id }, data: { occupancy: "OCCUPIED", isCheckoutToday: false } });
  });

  await audit({ action: "ROOM_CHANGE", userId: session.userId, roomId: from.id, fromStatus: from.status, toStatus: "DIRTY", meta: { from: from.number, to: to.number, reasonText: reason, role: session.role } });
  for (const r of [await prisma.room.findUnique({ where: { id: from.id } }), await prisma.room.findUnique({ where: { id: to.id } })]) if (r) broadcast("room:update", { room: r });
  broadcast("dayplan:updated", { date, changedRooms: [from.number, to.number] });
  const message = `Zimmerwechsel ${from.number} → ${to.number}`;
  await notifyFloorLeads({ roomId: from.id, type: "ROOM_CHANGE", level: "warning", housekeeper: true, frontOffice: true, skipUserId: session.userId, now, message, key: "notify.roomChangeMoved", vars: { from: from.number, to: to.number } }).catch(() => 0);
  await notifyFloorLeads({ roomId: to.id, type: "ROOM_CHANGE", level: "warning", housekeeper: true, skipUserId: session.userId, now, message, key: "notify.roomChangeMoved", vars: { from: from.number, to: to.number }, dmCopy: false }).catch(() => 0);
  return { ok: true, from: from.number, to: to.number };
}
