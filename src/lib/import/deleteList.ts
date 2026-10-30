import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { ImportType } from "@/lib/domain";
import { legacyTraceKey, traceKey } from "@/lib/dayplan/traceKey";
import type { ArrivalRow, DepartureRow, TraceRow } from "./types";

export class ListNotFoundError extends Error {}
export class PlanConfirmedError extends Error {}

const DELETE_TIMEOUT_MS = 20_000;
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Bestätigter Plan (AutoPlanProposal CONFIRMED) für den Betriebstag? */
export async function confirmedPlan(date: string) {
  return prisma.autoPlanProposal.findFirst({ where: { date, status: "CONFIRMED" }, orderBy: { confirmedAt: "desc" }, select: { id: true, confirmedAt: true } });
}

/**
 * Plan-Hinweis für den Planungshub: Gibt es einen bestätigten Plan, und wurden danach Listen
 * übernommen, ersetzt oder gelöscht? Dann „Listen geändert, Plan neu berechnen?". Der Plan selbst bleibt.
 */
export async function planStatus(date: string): Promise<{ confirmed: boolean; listsChanged: boolean }> {
  const plan = await confirmedPlan(date);
  if (!plan?.confirmedAt) return { confirmed: !!plan, listsChanged: false };
  const after = { gt: plan.confirmedAt };
  const applied = await prisma.importBatch.count({ where: { status: "APPLIED", appliedAt: after } });
  const deleted = await prisma.auditLog.count({ where: { action: "IMPORT_LIST_DELETED", createdAt: after, meta: { contains: `"today":"${date}"` } } });
  return { confirmed: true, listsChanged: applied + deleted > 0 };
}

type Parsed = { type: string; rows: unknown[] };
const rowsOf = async (type: ImportType, where: object): Promise<Parsed | null> => {
  const b = await prisma.importBatch.findFirst({ where: { type, status: "APPLIED", ...where }, orderBy: { appliedAt: "desc" }, include: { rows: true } });
  return b ? { type, rows: b.rows.map((r) => JSON.parse(r.payload) as unknown) } : null;
};
/** Aufenthalts-Schlüssel (Zimmer|Anreise) einer Departures- oder Arrivals-Liste — wie in mergeDay. */
const stayKeys = (p: Parsed | null) => new Set((p?.rows ?? []).map((r) => `${(r as DepartureRow | ArrivalRow).room}|${(r as DepartureRow | ArrivalRow).arrDate}`));
/** Trace-Schlüssel einer Arrivals- (Traces je Anreise) oder Traces-Liste — wie in mergeDay (HMAC + Altform). */
const traceKeys = (p: Parsed | null): string[] => {
  if (!p) return [];
  const raw = p.type === "ARRIVALS"
    ? (p.rows as ArrivalRow[]).flatMap((a) => a.traces.map((t) => ({ room: a.room, ...t })))
    : (p.rows as TraceRow[]);
  return raw.flatMap((t) => [traceKey(t.room, t.code, t.date, t.text), legacyTraceKey(t.room, t.code, t.date, t.text)]);
};

/**
 * Löscht die übernommene Liste `type` — alle übernommenen Stände dieses Typs, damit das Gate sie wieder als
 * fehlend zählt (sonst rückte ein älterer Stand nach und gälte als „veraltet"). Mit entfernt werden die Gastdaten,
 * die *nur* aus dieser Liste stammen (Import-Aufenthalte, offene Traces ohne Hausmann-Aufgabe, erwartete
 * Import-Anreisen, Forecast-Tage). Was auch in der jeweils anderen Liste steht, bleibt.
 * Ein bestätigter Plan (Betriebstag `today`) bleibt immer bestehen; ohne `keepPlan` wird dann abgebrochen.
 */
export async function deleteAppliedList(type: ImportType, today: string, userId: string, opts: { keepPlan?: boolean } = {}) {
  const batches = await prisma.importBatch.findMany({ where: { type, status: "APPLIED" }, include: { rows: true }, orderBy: { appliedAt: "desc" } });
  if (!batches.length) throw new ListNotFoundError("Diese Liste ist nicht eingelesen.");
  const plan = await confirmedPlan(today);
  if (plan && !opts.keepPlan) throw new PlanConfirmedError("Für diesen Tag ist bereits ein Plan bestätigt.");
  const businessDate = batches[0].businessDate;

  const own: Parsed = { type, rows: batches.flatMap((b) => b.rows.map((r) => JSON.parse(r.payload) as unknown)) };
  const ids = batches.map((b) => b.id);
  const removed = { stays: 0, traces: 0, arrivals: 0, forecastDays: 0 };
  // Die jeweils andere Liste so, wie mergeDay sie liest (zuletzt übernommen) — vor der Transaktion lesen.
  const keepStays = type === "DEPARTURES" ? stayKeys(await rowsOf("ARRIVALS", {})) : type === "ARRIVALS" ? stayKeys(await rowsOf("DEPARTURES", {})) : new Set<string>();
  const keepTraces = new Set(type === "ARRIVALS" ? traceKeys(await rowsOf("TRACES", {})) : type === "TRACES" ? traceKeys(await rowsOf("ARRIVALS", {})) : []);

  await prisma.$transaction(async (tx) => {
    if (type === "DEPARTURES" || type === "ARRIVALS") {
      // Aufenthalte: Schlüssel, die in der anderen Liste nicht vorkommen
      const only = [...stayKeys(own)].filter((k) => !keepStays.has(k));
      const rooms = new Map((await tx.room.findMany({ select: { id: true, number: true } })).map((r) => [r.number, r.id]));
      const stayIds: string[] = [];
      for (const k of only) {
        const [room, arr] = k.split("|");
        const roomId = rooms.get(room);
        if (!roomId || !arr) continue;
        const from = utcDay(arr);
        const s = await tx.stay.findMany({ where: { roomId, source: "IMPORT", checkIn: { gte: from, lt: new Date(from.getTime() + 86_400_000) } }, select: { id: true, roomId: true } });
        stayIds.push(...s.map((x) => x.id));
      }
      if (stayIds.length) {
        const arrivingRooms = (await tx.dayRoomPlan.findMany({ where: { arrivingStayId: { in: stayIds } }, select: { roomId: true } })).map((p) => p.roomId);
        await tx.dayRoomPlan.updateMany({ where: { stayId: { in: stayIds } }, data: { stayId: null } });
        await tx.dayRoomPlan.updateMany({ where: { arrivingStayId: { in: stayIds } }, data: { arrivingStayId: null } });
        await tx.trace.updateMany({ where: { stayId: { in: stayIds } }, data: { stayId: null } });
        // Erwartete Anreise auf dem Board kam aus genau diesem Aufenthalt (applyDayPlanToBoard)
        if (arrivingRooms.length) removed.arrivals = (await tx.arrival.deleteMany({ where: { source: "IMPORT", status: "EXPECTED", roomId: { in: arrivingRooms } } })).count;
        removed.stays = (await tx.stay.deleteMany({ where: { id: { in: stayIds } } })).count;
      }
    }
    if (type === "ARRIVALS" || type === "TRACES") {
      const keys = traceKeys(own).filter((k) => !keepTraces.has(k));
      // Erledigte Traces und solche mit Hausmann-Aufgabe sind Arbeitsnachweis und bleiben.
      if (keys.length) removed.traces = (await tx.trace.deleteMany({ where: { dedupeKey: { in: keys }, status: "OPEN", roomTaskId: null } })).count;
    }
    if (type === "FORECAST") removed.forecastDays = (await tx.forecastDay.deleteMany({ where: { batchId: { in: ids } } })).count;
    await tx.importBatch.deleteMany({ where: { id: { in: ids } } }); // Zeilen + Befunde per Cascade
  }, { timeout: DELETE_TIMEOUT_MS, maxWait: DELETE_TIMEOUT_MS });

  // Logbuch: nur Liste, Betriebstag, Zähler — keine Gastdaten.
  const rows = batches.reduce((n, b) => n + b.rowCount, 0);
  await audit({ action: "IMPORT_LIST_DELETED", userId, meta: { type, businessDate, today, batches: ids.length, rows, removed, planConfirmed: !!plan } });
  return { type, businessDate, rows, removed, planConfirmed: !!plan };
}
