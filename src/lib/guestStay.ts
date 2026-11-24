import { now as clockNow } from "@/lib/clock";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { berlinToday } from "@/lib/import/businessDay";

/**
 * Welcher Aufenthalt gehört gerade zu einem Zimmer? — S1 (Befund H1, Entscheidung 16.11.2026: „Der Gastbildschirm
 * grüßt immer nur den aktuellen Gast“). Die einzige Stelle, die das entscheidet; Gastbildschirm, `/status` und alle
 * Gast-Aktionen fragen bei jeder Anfrage frisch hier nach, nie aus einem Zwischenspeicher.
 *
 * Zimmer-Code (fester QR/NFC im Zimmer): aktiv ist genau der Aufenthalt mit Status IN_HOUSE (Check-in laut Front
 * Office bzw. Opera-Import). Daraus folgt:
 *   - Same-Day-Turn: nach dem Check-out des Vorgasts neutral, bis der neue Gast eingecheckt ist;
 *   - Late Check-out: bis zum Check-out der bisherige Gast, danach neutral;
 *   - Zimmerwechsel: der Aufenthalt hängt am neuen Zimmer — altes Zimmer neutral, neues zeigt den Gast;
 *   - zwei Aufenthalte gleichzeitig IN_HOUSE (Datenfehler aus dem Import): neutral, der Duty Manager wird gewarnt —
 *     nie raten.
 */
export type RoomStayState<S> = { kind: "none" } | { kind: "active"; stay: S } | { kind: "conflict"; stayIds: string[] };

export async function roomStayState(roomId: string) {
  const stays = await prisma.stay.findMany({ where: { roomId, status: "IN_HOUSE" }, orderBy: { checkIn: "desc" }, take: 3 });
  type S = (typeof stays)[number];
  if (stays.length === 0) return { kind: "none" } as RoomStayState<S>;
  if (stays.length > 1) return { kind: "conflict", stayIds: stays.map((s) => s.id) } as RoomStayState<S>;
  return { kind: "active", stay: stays[0] } as RoomStayState<S>;
}

/** Der aktive Aufenthalt des Zimmers oder null (keiner oder Konflikt). */
export async function currentStayForRoom(roomId: string) {
  const state = await roomStayState(roomId);
  return state.kind === "active" ? state.stay : null;
}

/**
 * Persönlicher Link (`/g/s/<stayToken>`): gilt für genau diesen Aufenthalt, vom Anreisetag (Betriebstag Berlin)
 * bis zur Abreise plus Kulanzzeit (Setting guestStayTokenGraceMinutes, Standard 2 h). Nach dem Check-out
 * (CHECKED_OUT) oder bei Storno (CANCELLED) sofort ungültig — dann zeigt auch dieser Link die neutrale Seite.
 */
export async function isStayTokenValid(
  stay: { status: string; checkIn: Date; checkOut: Date },
  now: Date = clockNow()
): Promise<boolean> {
  if (stay.status === "CANCELLED" || stay.status === "CHECKED_OUT") return false;
  if (berlinToday(now) < berlinToday(stay.checkIn)) return false;
  const settings = await getSettings();
  const validUntil = new Date(stay.checkOut.getTime() + settings.guestStayTokenGraceMinutes * 60_000);
  return now <= validUntil;
}

export async function resolveStayByToken(stayToken: string) {
  const stay = await prisma.stay.findUnique({ where: { stayToken }, include: { room: true } });
  if (!stay) return null;
  if (!(await isStayTokenValid(stay))) return null;
  return stay;
}
