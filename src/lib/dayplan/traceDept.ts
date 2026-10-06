import { prisma } from "@/lib/db";

export const TRACE_DEPTS = ["HOUSEKEEPING", "HOUSEMAN", "ENGINEERING", "FRONT_OFFICE"] as const;
export type TraceDept = (typeof TRACE_DEPTS)[number];

/** Setting-Schlüssel "traceDept.<OPERA-CODE>" überschreibt die Standardzuordnung (Hausregel gehört in die DB, nicht in den Code). */
export const TRACE_DEPT_PREFIX = "traceDept.";

/** Standardzuordnung Opera-Trace-Code → Abteilung. Unbekannte Codes → Housekeeping + Warnung. */
export const TRACE_DEPT_DEFAULTS: Record<string, TraceDept> = {
  BQ: "HOUSEMAN", TWIN: "HOUSEMAN", XBED: "HOUSEMAN",
  HK: "HOUSEKEEPING",
  ENG: "ENGINEERING", MISC: "ENGINEERING",
  FO: "FRONT_OFFICE", LCO: "FRONT_OFFICE",
};

export async function getTraceDeptMap(): Promise<Record<string, TraceDept>> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: TRACE_DEPT_PREFIX } } });
  const out: Record<string, TraceDept> = { ...TRACE_DEPT_DEFAULTS };
  for (const r of rows) {
    const code = r.key.slice(TRACE_DEPT_PREFIX.length).toUpperCase();
    if ((TRACE_DEPTS as readonly string[]).includes(r.value)) out[code] = r.value as TraceDept;
  }
  return out;
}
