import { prisma } from "@/lib/db";
import { berlinToUtc } from "@/lib/dayplan/time";

export const OPERA_NOTE_PREFIX = "Opera-Hinweis: ";

/**
 * F7 (M21): Technik-Hinweise aus Opera (Traces der Abteilung ENGINEERING) erscheinen beim Techniker als Auftrag.
 * Für jeden offenen Technik-Trace des Tages entsteht genau ein Mangel (Art OTHER, Text „Opera-Hinweis: …“) mit offenem
 * Auftrag — idempotent über Zimmer + Text + Tag. Gemeldet von einem Duty Manager (Opera-Import hat keinen eigenen Nutzer).
 * Kein Gastname: der Trace-Text kommt aus Opera und enthält nur die Anweisung.
 */
export async function ensureEngineeringOrdersFromTraces(date: string): Promise<number> {
  const traces = await prisma.trace.findMany({ where: { date, dept: "ENGINEERING", status: "OPEN" }, select: { roomId: true, text: true } });
  if (!traces.length) return 0;
  const reporter = await prisma.user.findFirst({ where: { role: "duty_manager" }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!reporter) return 0;
  const since = berlinToUtc(date, "00:00");
  let created = 0;
  for (const t of traces) {
    const note = `${OPERA_NOTE_PREFIX}${t.text}`.slice(0, 500);
    if (await prisma.defect.findFirst({ where: { roomId: t.roomId, note, createdAt: { gte: since } }, select: { id: true } })) continue;
    await prisma.defect.create({ data: { roomId: t.roomId, category: "OTHER", note, reportedById: reporter.id, workOrder: { create: {} } } });
    created++;
  }
  return created;
}
