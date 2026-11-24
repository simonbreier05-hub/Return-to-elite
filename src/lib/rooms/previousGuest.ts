import { now as clockNow } from "@/lib/clock";
import { prisma } from "@/lib/db";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";

/**
 * F3 Teil 1 (Befunde K4, H10): Ist der Vorgast noch im Zimmer? — die eine Regel für Housekeeper-Start, Supervisor-Freigabe,
 * Check-in beim Front Office und die Konflikt-Warnung „Anreise vor Late Check-out“.
 *
 * Noch da = heute Abreise oder Turn laut Tagesplan UND der abreisende Aufenthalt ist nicht CHECKED_OUT — oder ein Late
 * Check-out liegt noch in der Zukunft. Ohne Abreise heute ist nie ein Vorgast da. Keine Gastdaten im Ergebnis.
 */
export interface PreviousGuest { present: boolean; lateCheckout: string | null; reason: "NOT_CHECKED_OUT" | "LATE_CHECKOUT" | null }

const NONE: PreviousGuest = { present: false, lateCheckout: null, reason: null };

export async function previousGuest(roomId: string, now = clockNow()): Promise<PreviousGuest> {
  const date = berlinDate(now);
  const plan = await prisma.dayRoomPlan.findUnique({ where: { date_roomId: { date, roomId } }, select: { cleaningType: true, stayId: true, lateCheckout: true } });
  if (!plan || (plan.cleaningType !== "DEPARTURE" && plan.cleaningType !== "SAME_DAY_TURN")) return NONE;
  const lateCheckout = plan.lateCheckout ?? null;
  const stay = plan.stayId ? await prisma.stay.findUnique({ where: { id: plan.stayId }, select: { status: true } }) : null;
  if (stay && stay.status !== "CHECKED_OUT") return { present: true, lateCheckout, reason: "NOT_CHECKED_OUT" };
  if (!stay && lateCheckout && berlinToUtc(date, lateCheckout) > now) return { present: true, lateCheckout, reason: "LATE_CHECKOUT" };
  return { present: false, lateCheckout, reason: null };
}

/** Klartext für Rückfragen („Gast laut Front Office noch im Zimmer, Late Check-out 15:00“) — ohne Gastnamen. */
export function previousGuestText(room: { number: string }, p: PreviousGuest): string {
  return `Zimmer ${room.number}: Gast laut Front Office noch im Zimmer${p.lateCheckout ? `, Late Check-out ${p.lateCheckout}` : ""}.`;
}

/** Konflikt: Die Anreise kommt früher („HH:MM“), als der Vorgast laut Late Check-out geht. */
export function arrivalBeforeLateCheckout(eta: string | null | undefined, lateCheckout: string | null | undefined): boolean {
  return !!eta && !!lateCheckout && eta < lateCheckout;
}
