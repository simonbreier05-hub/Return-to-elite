import { prisma } from "@/lib/db";

export const OPERA_NOTE_PREFIX = "Opera-Hinweis: ";
/** Nach der Nachtlöschung (Trace-Texte können Gastnamen enthalten) steht nur noch dieser Text im Mangel. */
export const OPERA_NOTE_PURGED = "Opera-Hinweis (Text nachts gelöscht)";
export const OPERA_IMPORT_EMAIL = "opera-import@system.local";

/** Systemkonto „Opera-Import“ als Melder (kein echter Mitarbeiter; Passwort unbrauchbar, Anmeldung unmöglich). */
async function operaImportUserId(): Promise<string> {
  const u = await prisma.user.upsert({
    where: { email: OPERA_IMPORT_EMAIL },
    update: {},
    create: { email: OPERA_IMPORT_EMAIL, name: "Opera-Import", passwordHash: "!disabled", role: "front_office" },
    select: { id: true },
  });
  return u.id;
}

/**
 * F7 (M21): Technik-Hinweise aus Opera (Traces der Abteilung ENGINEERING) erscheinen beim Techniker als Auftrag.
 * Je Trace genau ein Mangel (Art OTHER) mit offenem Auftrag — Doppelte verhindert das Logbuch `OPERA_ORDER_CREATED`
 * (nur Trace-Id). Übersprungen werden Traces ohne Text (nach der Nachtlöschung) und Hinweise, für die im Zimmer schon ein
 * offener Auftrag mit demselben Text besteht (mehrtägiger Hinweis aus Opera). Der Text wird nachts gelöscht
 * (`purgeOperaOrderNotes`, aufgerufen von der Nachtlöschung).
 */
export async function ensureEngineeringOrdersFromTraces(date: string): Promise<number> {
  const traces = await prisma.trace.findMany({ where: { date, dept: "ENGINEERING", status: "OPEN", text: { not: "" } }, select: { id: true, roomId: true, text: true } });
  if (!traces.length) return 0;
  const done = new Set(
    (await prisma.auditLog.findMany({ where: { action: "OPERA_ORDER_CREATED", meta: { not: null } }, select: { meta: true }, orderBy: { createdAt: "desc" }, take: 2000 }))
      .map((l) => { try { return (JSON.parse(l.meta!) as { traceId?: string }).traceId; } catch { return undefined; } }),
  );
  let created = 0;
  let reporterId: string | null = null;
  for (const t of traces) {
    if (done.has(t.id)) continue;
    const note = `${OPERA_NOTE_PREFIX}${t.text}`.slice(0, 500);
    const openSame = await prisma.defect.findFirst({ where: { roomId: t.roomId, note, NOT: { workOrder: { status: "RESOLVED" } } }, select: { id: true } });
    reporterId ??= await operaImportUserId();
    if (!openSame) {
      await prisma.defect.create({ data: { roomId: t.roomId, category: "OTHER", note, reportedById: reporterId, workOrder: { create: {} } } });
      created++;
    }
    await prisma.auditLog.create({ data: { action: "OPERA_ORDER_CREATED", roomId: t.roomId, meta: JSON.stringify({ traceId: t.id }) } });
  }
  return created;
}

/** Nachtlöschung: Opera-Text in Mängeln entfernen (kann Gastnamen enthalten). */
export async function purgeOperaOrderNotes(): Promise<number> {
  const r = await prisma.defect.updateMany({ where: { note: { startsWith: OPERA_NOTE_PREFIX } }, data: { note: OPERA_NOTE_PURGED } });
  return r.count;
}
