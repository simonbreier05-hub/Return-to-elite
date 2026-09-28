import { prisma } from "./db";
import {
  DEFAULT_SETTINGS,
  DEFAULT_LINEN_CYCLE_DAYS,
  DEFAULT_TARGET_CREDITS_PER_ATTENDANT,
  DEFAULT_TIDY_CREDIT,
  ROOM_TYPE_DEFAULT_CREDITS,
  ROOM_TYPES,
  type RoomType,
  type SettingsShape,
} from "./domain";
import { PRIORITY_WEIGHTS, type PriorityWeights } from "./priority/computePriority";

/** Priority weights are stored under this prefix so they cannot collide. */
export const WEIGHT_PREFIX = "priorityWeight.";
/** Per-room-type credit overrides are stored under this prefix. */
export const ROOM_TYPE_CREDIT_PREFIX = "roomTypeCredit.";

/** Escalation thresholds: DB-backed (Setting table) with sane defaults. */
export async function getSettings(): Promise<SettingsShape> {
  const rows = await prisma.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_SETTINGS } as SettingsShape;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsShape)[]) {
    const raw = map[key];
    const parsed = raw !== undefined ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) out[key] = parsed;
  }
  return out;
}

/**
 * The weights behind the priority score, tunable by the duty manager.
 * Anything unset or unparsable falls back to the code default, so a bad row
 * can never take the scoring offline.
 */
export async function getPriorityWeights(): Promise<PriorityWeights> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: WEIGHT_PREFIX } } });
  const map = Object.fromEntries(rows.map((r) => [r.key.slice(WEIGHT_PREFIX.length), r.value]));
  const out = { ...PRIORITY_WEIGHTS } as PriorityWeights;
  for (const key of Object.keys(PRIORITY_WEIGHTS) as (keyof PriorityWeights)[]) {
    const parsed = Number(map[key]);
    if (Number.isFinite(parsed) && parsed >= 0) out[key] = parsed;
  }
  return out;
}

/**
 * Cleaning credits per room type (Standard 1.0, Junior Suite 1.5, ... —
 * see ROOM_TYPE_DEFAULT_CREDITS), overridable per type via
 * Setting rows keyed "roomTypeCredit.<TYPE>" so a new type or a house
 * policy change never needs a UI hardcode or a redeploy.
 */
export async function getRoomTypeCredits(): Promise<Record<RoomType, number>> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: ROOM_TYPE_CREDIT_PREFIX } } });
  const map = Object.fromEntries(rows.map((r) => [r.key.slice(ROOM_TYPE_CREDIT_PREFIX.length), r.value]));
  const out = { ...ROOM_TYPE_DEFAULT_CREDITS };
  for (const type of ROOM_TYPES) {
    const parsed = Number(map[type]);
    if (Number.isFinite(parsed) && parsed > 0) out[type] = parsed;
  }
  return out;
}

export interface PlanningCreditSettings {
  tidyCredit: number;
  linenCycleDays: number;
  targetCreditsPerAttendant: number;
}

/** The three planning-hub knobs from Schritt 4/5 — same "code default, Setting override" pattern as above. */
export async function getPlanningCreditSettings(): Promise<PlanningCreditSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ["tidyCredit", "linenCycleDays", "targetCreditsPerAttendant"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const tidyCredit = Number(map.tidyCredit);
  const linenCycleDays = Number(map.linenCycleDays);
  const targetCreditsPerAttendant = Number(map.targetCreditsPerAttendant);
  return {
    tidyCredit: Number.isFinite(tidyCredit) && tidyCredit > 0 ? tidyCredit : DEFAULT_TIDY_CREDIT,
    linenCycleDays: Number.isFinite(linenCycleDays) && linenCycleDays > 0 ? linenCycleDays : DEFAULT_LINEN_CYCLE_DAYS,
    targetCreditsPerAttendant:
      Number.isFinite(targetCreditsPerAttendant) && targetCreditsPerAttendant > 0
        ? targetCreditsPerAttendant
        : DEFAULT_TARGET_CREDITS_PER_ATTENDANT,
  };
}
