import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { audit } from "@/lib/audit";
import { berlinDate } from "./time";

/**
 * Tageswechsel des Zimmerstatus (Morgen-Regel, Antwort Simon 01.11.2026).
 *
 * Läuft, wenn die Listen für *heute* zusammengeführt werden (`POST /api/dayplan/merge`), nie für einen anderen Tag.
 *
 * | Heute laut Tagesplan       | Status heute früh                       | Ergebnis                           |
 * |----------------------------|-----------------------------------------|------------------------------------|
 * | Abreise / Turn / Bleiber   | CLEAN/INSPECTED von einem früheren Tag  | → DIRTY (heute neu zu reinigen)    |
 * | Abreise / Turn / Bleiber   | alles andere (liegen geblieben, DND/BLOCKED, IN_PROGRESS, OOO …) | unverändert |
 * | Anreise                    | CLEAN/INSPECTED                         | unverändert, „Vorgemerkt für Kontrolle" |
 * | Anreise / kein Eintrag     | sonst                                   | unverändert                        |
 *
 * Idempotent: ein heute gereinigtes Zimmer (statusSince heute) wird bei einem Nachimport nie zurückgesetzt.
 * Zuteilungen (`assignedToId`) bleiben unberührt.
 */
export type RolloverAction = "RESET_DIRTY" | "KEEP" | "CONTROL";

const DONE = new Set(["CLEAN", "INSPECTED"]);
const WORK_KINDS = new Set(["DEPARTURE", "SAME_DAY_TURN", "STAYOVER"]);

export function rolloverAction(i: { cleaningType: string | null; status: string; statusSinceDay: string; date: string }): RolloverAction {
  if (!DONE.has(i.status)) return "KEEP";
  if (i.cleaningType === "ARRIVAL") return "CONTROL";
  if (i.cleaningType && WORK_KINDS.has(i.cleaningType) && i.statusSinceDay < i.date) return "RESET_DIRTY";
  return "KEEP";
}

/** Vorgemerkt für Kontrolle: Anreise heute in ein schon gereinigtes Zimmer (Abreise vom Vortag, kein Turn). */
export const isControlRoom = (kind: string | null, status: string) => kind === "ARRIVAL" && DONE.has(status);

export async function rolloverStatuses(date: string, userId: string, now = new Date()): Promise<{ reset: string[]; control: string[]; skipped: boolean }> {
  if (date !== berlinDate(now)) return { reset: [], control: [], skipped: true };
  const plan = await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: { select: { id: true, number: true, status: true, statusSince: true } } } });
  const reset: string[] = [];
  const control: string[] = [];
  for (const p of plan) {
    const action = rolloverAction({ cleaningType: p.cleaningType, status: p.room.status, statusSinceDay: berlinDate(p.room.statusSince), date });
    if (action === "CONTROL") control.push(p.room.number);
    if (action !== "RESET_DIRTY") continue;
    const room = await prisma.room.update({ where: { id: p.room.id }, data: { status: "DIRTY", statusSince: now, reworkNote: null } });
    await audit({ action: "STATUS_ROLLOVER", userId, roomId: p.room.id, fromStatus: p.room.status, toStatus: "DIRTY", meta: { date } });
    broadcast("room:update", { room });
    reset.push(p.room.number);
  }
  return { reset, control, skipped: false };
}
