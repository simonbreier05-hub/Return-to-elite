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
  // Review (M4): aus dem Logbuch — eine Liste kann mehrmals am Tag übernommen werden (ältere Batches werden ersetzt/gelöscht)
  const since = berlinToUtc(today, "00:00");
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ["IMPORT_APPLIED", "IMPORT_LIST_DELETED"] }, createdAt: { gte: since } },
    select: { action: true, createdAt: true, meta: true, userId: true },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  const ids = [...new Set(logs.map((l) => l.userId).filter((x): x is string => !!x))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return logs.map((l) => {
    let meta: { type?: string; businessDate?: string; rows?: number } = {};
    try { meta = JSON.parse(l.meta ?? "{}"); } catch { /* altes Format */ }
    return {
      at: l.createdAt.toISOString(), type: meta.type ?? "?", action: l.action === "IMPORT_APPLIED" ? "APPLIED" as const : "DELETED" as const,
      by: l.userId ? names.get(l.userId) ?? null : null, rows: typeof meta.rows === "number" ? meta.rows : null, businessDate: meta.businessDate ?? null,
    };
  });
}
