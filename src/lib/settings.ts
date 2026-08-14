import { prisma } from "./db";
import { DEFAULT_SETTINGS, type SettingsShape } from "./domain";

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
