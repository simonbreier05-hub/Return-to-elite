import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";

/**
 * Betrieb L2 (Punkt 9, Meeting 13.11.2026): wiederkehrende Hausmann-Aufgaben (Tabelle `RecurringTask`, z. B. „Blumen gießen
 * alle 2 Tage“ in Zimmer 305). An jedem fälligen Tag entsteht genau eine `RoomTask` (Art SONSTIGES, Text = `label`) — sie
 * steht damit fest auf der Hausmann-Liste wie jede andere Aufgabe. `lastCreatedOn` verhindert Doppelte. Kein Gastbezug.
 */
const DAY = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);

/** Ist die Aufgabe am Tag `date` fällig? Ab `startDate`, dann alle `everyDays` Tage. Rein. */
export function isRecurringDue(t: { startDate: string; everyDays: number; active: boolean }, date: string): boolean {
  if (!t.active || t.everyDays < 1) return false;
  const diff = dayNum(date) - dayNum(t.startDate);
  return diff >= 0 && diff % t.everyDays === 0;
}

/** Legt für alle heute fälligen, noch nicht erzeugten Aufgaben die RoomTask an. Mehrfach aufrufbar (idempotent). */
export async function ensureRecurringTasks(date: string): Promise<number> {
  const due = (await prisma.recurringTask.findMany({ where: { active: true } })).filter((t) => isRecurringDue(t, date) && t.lastCreatedOn !== date);
  let created = 0;
  for (const t of due) {
    // Erst den Tag markieren (bedingt) — so legen zwei gleichzeitige Aufrufe nie zwei Aufgaben an
    const claimed = await prisma.recurringTask.updateMany({ where: { id: t.id, OR: [{ lastCreatedOn: null }, { lastCreatedOn: { not: date } }] }, data: { lastCreatedOn: date } });
    if (claimed.count === 0) continue;
    const roomTask = await prisma.roomTask.create({
      data: { roomId: t.roomId, type: "SONSTIGES", note: t.label, createdById: t.createdById },
      include: { room: { select: { id: true, number: true, floor: true } } },
    });
    broadcast("roomtask:update", { roomTask });
    created++;
  }
  return created;
}
