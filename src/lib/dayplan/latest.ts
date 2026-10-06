import { prisma } from "@/lib/db";

/** Tag, für den zuletzt Departures übernommen wurden. */
export async function latestPlanDate(): Promise<string | null> {
  const b = await prisma.importBatch.findFirst({ where: { type: "DEPARTURES", status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
  return b?.businessDate ?? null;
}
