import { prisma } from "@/lib/db";
import { berlinToUtc } from "@/lib/dayplan/time";

/** F4-Nachtrag (M8): ein Eintrag im Importverlauf des Tages — nur Liste, Zeitpunkt, Person, Zeilen. Nie Gastdaten. */
export interface ImportHistoryEntry {
  at: string;
  type: string;
  action: "APPLIED" | "DELETED";
  by: string | null;
  rows: number | null;
  businessDate: string | null;
}

/** Wer hat heute (Betriebstag `today`, Berlin) welche Liste übernommen oder gelöscht — neueste zuerst, höchstens 30. */
export async function importHistory(today: string): Promise<ImportHistoryEntry[]> {
  const since = berlinToUtc(today, "00:00");
  const [applied, deleted] = await Promise.all([
    prisma.importBatch.findMany({
      where: { status: "APPLIED", appliedAt: { gte: since } },
      select: { type: true, appliedAt: true, rowCount: true, businessDate: true, uploadedBy: { select: { name: true } } },
      orderBy: { appliedAt: "desc" }, take: 30,
    }),
    prisma.auditLog.findMany({
      where: { action: "IMPORT_LIST_DELETED", createdAt: { gte: since } },
      select: { createdAt: true, meta: true, userId: true },
      orderBy: { createdAt: "desc" }, take: 30,
    }),
  ]);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: deleted.map((d) => d.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const out: ImportHistoryEntry[] = [
    ...applied.map((b) => ({ at: b.appliedAt!.toISOString(), type: b.type, action: "APPLIED" as const, by: b.uploadedBy?.name ?? null, rows: b.rowCount, businessDate: b.businessDate })),
    ...deleted.map((d) => {
      let meta: { type?: string; businessDate?: string } = {};
      try { meta = JSON.parse(d.meta ?? "{}"); } catch { /* altes Format */ }
      return { at: d.createdAt.toISOString(), type: meta.type ?? "?", action: "DELETED" as const, by: d.userId ? names.get(d.userId) ?? null : null, rows: null, businessDate: meta.businessDate ?? null };
    }),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}
