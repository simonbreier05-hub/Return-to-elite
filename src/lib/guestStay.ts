import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/**
 * The room-code (NFC/QR) path always resolves to "the current stay of this
 * room" — Prompt G2 Teil 2: "Auflösung immer zum aktuellen Aufenthalt des
 * Zimmers (Status „im Haus")". Unlike the pre-arrival token below, this
 * never looks at dates: a Stay is either the one actually checked in right
 * now, or it doesn't count for this room yet/anymore.
 */
export function currentStayForRoom(roomId: string) {
  return prisma.stay.findFirst({ where: { roomId, status: "IN_HOUSE" }, orderBy: { checkIn: "desc" } });
}

/**
 * The pre-arrival link's stayToken has a wider validity window than
 * Room.guestAccessCode's "im Haus" check: it has to work from the arrival
 * *day* (before check-in flips Stay.status to IN_HOUSE) through departure
 * plus a grace period (Setting guestStayTokenGraceMinutes, default 2h), so
 * a guest doesn't get locked out mid-checkout. CANCELLED stays never
 * resolve, regardless of dates.
 */
export async function isStayTokenValid(
  stay: { status: string; checkIn: Date; checkOut: Date },
  now: Date = new Date()
): Promise<boolean> {
  if (stay.status === "CANCELLED") return false;
  const settings = await getSettings();
  const validFrom = startOfDay(stay.checkIn);
  const validUntil = new Date(stay.checkOut.getTime() + settings.guestStayTokenGraceMinutes * 60_000);
  return now >= validFrom && now <= validUntil;
}

export async function resolveStayByToken(stayToken: string) {
  const stay = await prisma.stay.findUnique({ where: { stayToken }, include: { room: true } });
  if (!stay) return null;
  if (!(await isStayTokenValid(stay))) return null;
  return stay;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
