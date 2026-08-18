import { prisma } from "./db";
import { DEFAULT_SETTINGS, type SettingsShape } from "./domain";
import { PRIORITY_WEIGHTS, type PriorityWeights } from "./priority/computePriority";

/** Priority weights are stored under this prefix so they cannot collide. */
export const WEIGHT_PREFIX = "priorityWeight.";

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
