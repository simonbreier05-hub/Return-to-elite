import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { addDays } from "@/lib/import/dates";
import { getSettings } from "@/lib/settings";
import { deviationWeight, learnPatterns, type DeviationLike, type Pattern } from "./patterns";

/**
 * DB-Seite „Lernen aus Planungsänderungen" (H3). Abweichungen in `PlanDeviation` (ohne Namen/Gastdaten),
 * Schalter als Setting-Schlüssel (Text):
 *  - `learning.enabled` = "on" | "off" (Gesamtschalter, Standard an)
 *  - `learning.disabled` = JSON-Liste ausgeschalteter Muster-Schlüssel
 *  - `learning.deleted`  = JSON { Muster-Schlüssel: Löschdatum } — danach lernt das Muster nur aus neuen Beobachtungen
 * Stufe der Housekeeper (Beschäftigtendaten) wird nur hier gelesen; Datei steht in der Allow-List (privacy.test.ts).
 */
const K = { enabled: "learning.enabled", disabled: "learning.disabled", deleted: "learning.deleted" } as const;
/** So weit zurück werden Abweichungen gelesen (Kalendertage); die Regel zählt nur Planungstage. */
const LOOKBACK_DAYS = 60;

async function readKey(key: string): Promise<string | null> {
  return (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;
}
async function writeKey(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
const json = <T>(raw: string | null, fallback: T): T => { try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };

export interface LearningState { enabled: boolean; disabled: string[]; deletedAt: Record<string, string> }
export async function getLearningState(): Promise<LearningState> {
  const [e, d, x] = await Promise.all([readKey(K.enabled), readKey(K.disabled), readKey(K.deleted)]);
  return { enabled: e !== "off", disabled: json<string[]>(d, []), deletedAt: json<Record<string, string>>(x, {}) };
}

/** Gewicht des Tages: außergewöhnlich wenig Personal (Vergleich mit den letzten bestätigten Plänen) → 0. */
async function dayWeight(date: string, teamToday: number): Promise<number> {
  const s = await getSettings();
  const prev = await prisma.autoPlanProposal.findMany({ where: { status: "CONFIRMED", date: { lt: date } }, orderBy: { date: "desc" }, take: 5, select: { payload: true } });
  const sizes = prev.map((p) => json<{ input?: { housekeepers?: unknown[] } }>(p.payload, {}).input?.housekeepers?.length ?? 0).filter((n) => n > 0);
  return deviationWeight(teamToday, sizes, s.learnStaffDropShare);
}

/** Beim Bestätigen des Plans: Zimmer verschoben / zurückgestellt (aus der Abweichung Vorschlag → Bestätigung). */
export async function recordRoomDeviations(date: string, deviations: { room: string; from: string | null; to: string | null }[], teamToday: number) {
  if (!deviations.length) return 0;
  const weight = await dayWeight(date, teamToday);
  await prisma.planDeviation.deleteMany({ where: { date, kind: { in: ["ROOM_MOVED", "ROOM_DEFERRED"] } } }); // erneutes Bestätigen ersetzt
  await prisma.planDeviation.createMany({
    data: deviations.map((d) => ({
      date, kind: d.to ? "ROOM_MOVED" : "ROOM_DEFERRED", roomNumber: d.room, personId: d.to ?? d.from, before: d.from, after: d.to, weight,
    })),
  });
  return deviations.length;
}

/** Beim Speichern der Etagenzuweisung: Vorschlag (Etage) gegenüber der gespeicherten Etage(n) je Person. */
export async function recordFloorDeviations(date: string, suggestions: { userId: string; floor: number }[], saved: Record<string, number[]>, teamToday: number) {
  const changed = suggestions.filter((s) => !(saved[s.userId] ?? []).includes(s.floor));
  await prisma.planDeviation.deleteMany({ where: { date, kind: "FLOOR_CHANGED" } });
  if (!changed.length) return 0;
  const weight = await dayWeight(date, teamToday);
  await prisma.planDeviation.createMany({
    data: changed.map((s) => ({ date, kind: "FLOOR_CHANGED", personId: s.userId, floor: s.floor, before: String(s.floor), after: (saved[s.userId] ?? []).join(","), weight })),
  });
  return changed.length;
}

/** Alle gelernten Muster (auch ausgeschaltete), mit Status für die Ansicht „Gelernte Regeln". */
export async function listPatterns(today: string): Promise<(Pattern & { active: boolean })[]> {
  const [s, st] = await Promise.all([getSettings(), getLearningState()]);
  const since = addDays(today, -LOOKBACK_DAYS);
  const [devs, proposals, users] = await Promise.all([
    prisma.planDeviation.findMany({ where: { date: { gte: since, lte: today } } }),
    prisma.autoPlanProposal.findMany({ where: { status: { in: ["CONFIRMED", "SUPERSEDED"] }, confirmedAt: { not: null }, date: { gte: since, lte: today } }, select: { date: true } }),
    prisma.user.findMany({ where: { role: "room_attendant" }, select: { id: true, hkLevel: true } }),
  ]);
  const level = new Map(users.map((u) => [u.id, u.hkLevel]));
  const planningDays = [...proposals.map((p) => p.date), ...devs.map((d) => d.date)];
  const patterns = learnPatterns(devs as DeviationLike[], planningDays, { window: s.learnWindow, minDays: s.learnMinDays, expireDays: s.learnExpireDays }, { levelOf: (id) => level.get(id), deletedAt: st.deletedAt });
  return patterns.map((p) => ({ ...p, active: st.enabled && !st.disabled.includes(p.key) }));
}

/** Muster, die in den nächsten Vorschlag einfließen (Gesamtschalter an, Muster nicht ausgeschaltet). */
export async function activePatterns(today: string): Promise<Pattern[]> {
  return (await listPatterns(today)).filter((p) => p.active);
}

export async function setLearningEnabled(on: boolean, userId: string) {
  await writeKey(K.enabled, on ? "on" : "off");
  await audit({ action: "LEARNING_TOGGLED", userId, meta: { on } });
}
export async function setPatternActive(key: string, on: boolean, userId: string) {
  const st = await getLearningState();
  const next = on ? st.disabled.filter((k) => k !== key) : [...new Set([...st.disabled, key])];
  await writeKey(K.disabled, JSON.stringify(next));
  await audit({ action: "LEARNED_RULE_TOGGLED", userId, meta: { key, on } });
}
export async function deletePattern(key: string, today: string, userId: string) {
  const st = await getLearningState();
  await writeKey(K.deleted, JSON.stringify({ ...st.deletedAt, [key]: today }));
  await writeKey(K.disabled, JSON.stringify(st.disabled.filter((k) => k !== key)));
  await audit({ action: "LEARNED_RULE_DELETED", userId, meta: { key } });
}
