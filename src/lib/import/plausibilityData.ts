import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { getDayNumbers } from "@/lib/dayplan/dayNumbersData";
import { checkPlausibility, plausibilitySignature, type PlausibilityFinding } from "./plausibility";
import type { ArrivalRow, DepartureRow, InHouseRow } from "./types";

/** Setting-Schlüssel der Bestätigung „gesehen, trotzdem planen“ (nur Datum + Fingerabdruck, keine Gastdaten). */
const ACK_KEY = "plausibilityAck";

async function rowsOf<T>(type: "INHOUSE" | "ARRIVALS" | "DEPARTURES"): Promise<T[] | null> {
  const b = await prisma.importBatch.findFirst({ where: { type, status: "APPLIED" }, orderBy: { appliedAt: "desc" }, include: { rows: true } });
  if (!b || (b.rowCount > 0 && !b.rows.length)) return null; // fehlt oder nachts gelöscht
  return b.rows.map((r) => JSON.parse(r.payload) as T);
}

export interface PlausibilityState { date: string; findings: PlausibilityFinding[]; signature: string; acknowledged: boolean }

/** Prüfung für den Betriebstag aus den übernommenen Listen, dem Forecast und dem Tagesplan (eine Quelle: getDayNumbers). */
export async function getPlausibility(date: string): Promise<PlausibilityState> {
  const [settings, forecast, inHouse, arrivals, departures, plan] = await Promise.all([
    getSettings(), prisma.forecastDay.findUnique({ where: { date } }),
    rowsOf<InHouseRow>("INHOUSE"), rowsOf<ArrivalRow>("ARRIVALS"), rowsOf<DepartureRow>("DEPARTURES"),
    prisma.dayRoomPlan.findMany({ where: { date }, select: { cleaningType: true } }),
  ]);
  const known = new Set((await prisma.room.findMany({ select: { number: true } })).map((r) => r.number));
  const listed = [...(inHouse ?? []), ...(arrivals ?? []).filter((r) => r.arrDate === date), ...(departures ?? []).filter((r) => r.depDate === date)].map((r) => r.room);
  const by = (t: string) => plan.filter((p) => p.cleaningType === t).length;
  const findings = checkPlausibility({
    date, inventory: settings.roomInventory, forecast, inHouse, arrivals, departures,
    plan: plan.length ? { occupied: (await getDayNumbers(date)).numbers.occupied, arrivals: by("ARRIVAL") + by("SAME_DAY_TURN"), departures: by("DEPARTURE") + by("SAME_DAY_TURN") } : null,
    unknownRooms: [...new Set(listed.filter((n) => !known.has(n)))],
  });
  const signature = plausibilitySignature(date, findings);
  const ack = await prisma.setting.findUnique({ where: { key: ACK_KEY } });
  return { date, findings, signature, acknowledged: !!findings.length && ack?.value === signature };
}

/** Supervisor bestätigt die Abweichungen und plant weiter (Prinzip: System schlägt vor, Supervisor entscheidet). */
export async function acknowledgePlausibility(date: string, signature: string, userId: string) {
  const cur = await getPlausibility(date);
  if (cur.signature !== signature) return false; // Befunde haben sich inzwischen geändert → neu ansehen
  await prisma.setting.upsert({ where: { key: ACK_KEY }, create: { key: ACK_KEY, value: signature }, update: { value: signature } });
  await audit({ action: "IMPORT_PLAUSIBILITY_ACK", userId, meta: { date, findings: cur.findings.map((f) => f.key) } });
  return true;
}
