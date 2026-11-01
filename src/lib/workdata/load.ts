import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { addDays } from "@/lib/import/dates";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { getSettings } from "@/lib/settings";
import { SUITE_TYPES } from "@/lib/autoplan/types";
import { defaultMinutes, extractSamples, houseMedians, personStats, planningMinutes, type Category, type PersonStats, type Sample } from "./stats";

/**
 * DB-Seite der Arbeitsdaten (H3, Schritt 6). Mitarbeiterdaten (DSGVO): nur hinter `requireRole(["supervisor"])`
 * bzw. für die eigene Person (`/api/workdata/me`). Nichts wird pro Person gespeichert — alles wird bei Bedarf aus dem
 * Statusprotokoll (AuditLog STATUS_CHANGE) der letzten `workdataRetentionDays` (90) Tage berechnet; ältere Werte fließen
 * nirgends mehr ein. Keine Gastdaten.
 *
 * Schalter (Setting, Text): `workdata.usePlanning` = "on" | "off" — Messdaten in der Planung verwenden (Standard an).
 */
const FLAG = "workdata.usePlanning";

export async function usePlanningFlag(): Promise<boolean> {
  return (await prisma.setting.findUnique({ where: { key: FLAG } }))?.value !== "off";
}
export async function setUsePlanningFlag(on: boolean, userId: string) {
  const value = on ? "on" : "off";
  await prisma.setting.upsert({ where: { key: FLAG }, create: { key: FLAG, value }, update: { value } });
  await audit({ action: "WORKDATA_PLANNING_TOGGLED", userId, meta: { on } });
}

export interface WorkDataSet {
  samples: Sample[];
  categoryOf: (s: Sample) => Category[];
  minSamples: number;
  defaults: Record<Category, number>;
  house: Partial<Record<Category, number>>;
  since: string;
}

/** Messungen der letzten N Tage vor `date` (heute zählt mit). */
export async function loadWorkData(date: string): Promise<WorkDataSet> {
  const s = await getSettings();
  const since = addDays(date, -s.workdataRetentionDays);
  const events = await prisma.auditLog.findMany({
    where: { action: "STATUS_CHANGE", roomId: { not: null }, createdAt: { gte: berlinToUtc(since, "00:00"), lt: berlinToUtc(addDays(date, 1), "00:00") } },
    select: { userId: true, roomId: true, toStatus: true, createdAt: true },
  });
  const samples = extractSamples(events.map((e) => ({ userId: e.userId, roomId: e.roomId!, toStatus: e.toStatus ?? "", at: e.createdAt.getTime(), day: berlinDate(e.createdAt) })));
  const roomIds = [...new Set(samples.map((x) => x.roomId))];
  const [plans, rooms] = await Promise.all([
    prisma.dayRoomPlan.findMany({ where: { roomId: { in: roomIds }, date: { gte: since, lte: date } }, select: { roomId: true, date: true, cleaningType: true, laundryDue: true } }),
    prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, type: true } }),
  ]);
  const plan = new Map(plans.map((p) => [`${p.roomId}|${p.date}`, p]));
  const suite = new Set(rooms.filter((r) => (SUITE_TYPES as readonly string[]).includes(r.type)).map((r) => r.id));
  const categoryOf = (x: Sample): Category[] => {
    const p = plan.get(`${x.roomId}|${x.day}`);
    const out: Category[] = [];
    if (p?.cleaningType === "SAME_DAY_TURN") out.push("TURN");
    else if (p?.cleaningType === "DEPARTURE") out.push("DEPARTURE");
    else if (p?.cleaningType === "STAYOVER") out.push(p.laundryDue ? "LAUNDRY" : "STAYOVER");
    if (suite.has(x.roomId)) out.push("SUITE");
    return out;
  };
  const defaults = defaultMinutes(s.minutesPerCredit, s.stayoverFactor, s.stayoverLaundryFactor);
  return { samples, categoryOf, minSamples: s.workdataMinSamples, defaults, house: houseMedians(samples, categoryOf, s.workdataMinSamples), since };
}

export function statsFor(set: WorkDataSet, hkId: string): PersonStats {
  return personStats(hkId, set.samples, set.categoryOf, set.minSamples);
}

/** Minuten je Reinigungsart je Housekeeper für die Planung (nur wenn der Schalter an ist; sonst leer). */
export async function planningMinutesFor(date: string, hkIds: string[]): Promise<Record<string, Record<Category, number>>> {
  if (!hkIds.length || !(await usePlanningFlag())) return {};
  const set = await loadWorkData(date);
  return Object.fromEntries(hkIds.map((id) => [id, planningMinutes(statsFor(set, id), set.house, set.defaults)]));
}
