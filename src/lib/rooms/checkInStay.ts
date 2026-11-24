import { prisma } from "@/lib/db";
import { berlinToday } from "@/lib/import/businessDay";
import { berlinToUtc } from "@/lib/dayplan/time";

/**
 * F9 (A4): Der Aufenthalt, der heute in diesem Zimmer anreist — zuerst laut Tagesplan (`DayRoomPlan.arrivingStayId`),
 * sonst der Aufenthalt mit Anreisetag heute. Nur EXPECTED/IN_HOUSE.
 */
export async function arrivingStayToday(roomId: string, date = berlinToday()) {
  const plan = await prisma.dayRoomPlan.findUnique({ where: { date_roomId: { date, roomId } }, select: { arrivingStayId: true } });
  if (plan?.arrivingStayId) {
    const s = await prisma.stay.findUnique({ where: { id: plan.arrivingStayId }, select: { id: true, status: true } });
    if (s && (s.status === "EXPECTED" || s.status === "IN_HOUSE")) return s;
  }
  const from = new Date(`${date}T00:00:00Z`), to = new Date(from.getTime() + 86_400_000);
  return prisma.stay.findFirst({
    where: { roomId, checkIn: { gte: from, lt: to }, status: { in: ["EXPECTED", "IN_HOUSE"] } },
    orderBy: { checkIn: "asc" },
    select: { id: true, status: true },
  });
}

/**
 * F9 (A4): Check-in am Front Office setzt den passenden Aufenthalt auf „im Haus“ (Gastbildschirm grüßt den neuen Gast
 * sofort, Zimmerwechsel am Anreisetag geht). Voraussetzung (Vorgast ausgecheckt) prüft der Aufrufer über `previousGuest`.
 * Ein späterer Import setzt IN_HOUSE nie zurück (`mergeDay`). Gibt die Stay-Id zurück oder null (kein Aufenthalt bekannt).
 */
export async function markArrivingStayInHouse(roomId: string): Promise<string | null> {
  const stay = await arrivingStayToday(roomId);
  if (!stay) return null;
  if (stay.status !== "IN_HOUSE") await prisma.stay.update({ where: { id: stay.id }, data: { status: "IN_HOUSE" } });
  await prisma.room.update({ where: { id: roomId }, data: { occupancy: "OCCUPIED" } });
  return stay.id;
}

/** F9 (A4): Ist der neue Gast heute schon eingecheckt (Aufenthalt „im Haus“ oder Front-Office-Check-in)? */
export async function newGuestCheckedInToday(roomId: string, arrivingStayId: string | null): Promise<boolean> {
  if (arrivingStayId) {
    const s = await prisma.stay.findUnique({ where: { id: arrivingStayId }, select: { status: true } });
    if (s?.status === "IN_HOUSE") return true;
  }
  const since = berlinToUtc(berlinToday(), "00:00");
  return !!(await prisma.arrival.findFirst({ where: { roomId, status: "CHECKED_IN", updatedAt: { gte: since } }, select: { id: true } }));
}
