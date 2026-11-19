import { prisma } from "@/lib/db";
import { berlinHHMM } from "@/lib/dayplan/time";
import { arrivalBeforeLateCheckout, previousGuest } from "@/lib/rooms/previousGuest";
import { arrivalTodayWhere } from "@/lib/rooms/blockedRooms";
import { notifyFloorLeads } from "@/lib/rooms/notifyLeads";

/**
 * F3 Teil 1 (H10, Entscheidung Frage 8 „Late Check-out gegen Anreise: Supervisor/DM entscheiden“): Kommt die Anreise heute
 * früher, als der Vorgast geht (Late Check-out später als ETA) — oder ist sie „Sofort“ (`rush`) und der Vorgast noch da —,
 * bekommen Supervisor der Etage und Duty Manager eine dringende Meldung. Front Office sieht das Kennzeichen „Konflikt“
 * (`GET /api/arrivals`). Nur Zimmer und Uhrzeiten, keine Gastdaten. Einmal je Stand (Dedupe über Uhrzeiten).
 */
export async function warnArrivalConflict(roomId: string, actorId: string | null, rush = false, now = new Date()): Promise<number> {
  const prev = await previousGuest(roomId, now);
  if (!prev.present) return 0;
  const arrival = await prisma.arrival.findFirst({ where: { roomId, ...arrivalTodayWhere(now) }, orderBy: { eta: "asc" }, select: { eta: true, neededNow: true } });
  if (!arrival) return 0;
  const eta = arrival.eta ? berlinHHMM(arrival.eta) : null;
  const conflict = arrivalBeforeLateCheckout(eta, prev.lateCheckout) || rush || arrival.neededNow;
  if (!conflict) return 0;
  const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId }, select: { number: true } });
  const lco = prev.lateCheckout ?? "—";
  return notifyFloorLeads({
    roomId, type: "ARRIVAL_CONFLICT", level: "warning", skipUserId: actorId, now,
    message: `Zimmer ${room.number}: Anreise ${eta ?? "sofort"} vor Abreise des Vorgasts (Late Check-out ${lco}) — bitte entscheiden.`,
    key: "notify.arrivalConflict", vars: { n: room.number, eta: eta ?? "—", lco },
    dedupeKey: `ARRIVAL_CONFLICT:${roomId}:${eta}:${lco}:${rush || arrival.neededNow}`,
  });
}
