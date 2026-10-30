import { prisma } from "@/lib/db";
import { berlinToday } from "@/lib/import/businessDay";

/**
 * Einzige Datenquelle für den Arbeitstag ist der Planungshub: eingelesene Listen → Tagesplan (`DayRoomPlan`)
 * des Betriebstags → Board (`applyDayPlanToBoard`). Gibt es für heute keinen Tagesplan, zeigen Board, Listen,
 * Grundriss und Zuteilung nichts zum Tag — nie den Stand eines älteren Tages.
 */
export interface HubDay { date: string; ready: boolean }

export async function hubDay(now: Date = new Date()): Promise<HubDay> {
  const date = berlinToday(now);
  const ready = (await prisma.dayRoomPlan.count({ where: { date } })) > 0;
  return { date, ready };
}

/** Antwort, wenn für heute noch kein Tagesplan aus dem Planungshub da ist (409, Oberfläche zeigt den Hinweis). */
export const HUB_MISSING_MESSAGE = "Für heute sind noch keine Listen im Planungshub eingelesen.";

/** Eine Zuteilung gilt nur, wenn sie heute gemacht wurde (bestätigter Plan oder Grundriss) — sonst ist sie von gestern. */
export const assignedToday = (assignedOn: string | null | undefined, date: string) => assignedOn === date;
