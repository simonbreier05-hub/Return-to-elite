import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { generateOpaqueToken } from "@/lib/guestToken";
import { getPlanningCreditSettings } from "@/lib/settings";
import { diffDays } from "@/lib/import/dates";
import { DEPARTURES_MIN_HORIZON_DAYS } from "@/lib/import/mapping";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import type { ArrivalRow, DepartureRow, GuestName, ParseIssue, TraceRow } from "@/lib/import/types";
import { createRoomTask } from "@/lib/rooms/createRoomTask";
import { compareWithForecast, deriveDayPlan, type DayCleaningType, type DayFiguresDerived } from "./derive";
import { getTraceDeptMap, TRACE_DEPT_DEFAULTS } from "./traceDept";

const issue = (severity: ParseIssue["severity"], code: string, message: string, room?: string): ParseIssue => ({ severity, code, message, room });
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Mrs. Testfrau" — Anrede, Titel, Nachname; nie der volle Name in Stay/Arrival. */
const shortName = (g: GuestName) => [g.salutation, g.title, g.lastName].filter(Boolean).join(" ");

/** "HH:MM" am Tag `date` in Berlin → UTC-Zeitpunkt. */
export function berlinToUtc(date: string, hhmm: string): Date {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

async function appliedRows<T>(type: "DEPARTURES" | "ARRIVALS" | "TRACES", date: string, exact: boolean) {
  const batch = await prisma.importBatch.findFirst({
    where: { type, status: "APPLIED", ...(exact ? { businessDate: date } : {}) },
    orderBy: { appliedAt: "desc" },
    include: { rows: true },
  });
  return batch ? { batch, rows: batch.rows.map((r) => JSON.parse(r.payload) as T) } : null;
}

export interface MergeResult {
  date: string;
  figures: DayFiguresDerived;
  issues: ParseIssue[];
  counts: { stays: number; staysNeedingReview: number; traces: number; roomTasks: number; changedAssigned: number };
}

/**
 * Importierte Listen eines Tages zusammenführen: Aufenthalte (Stay), Traces,
 * Tagesplan (DayRoomPlan). Idempotent; ein Nachimport verändert keine
 * Zuteilungen (Room.assignedToId) — betroffene Zimmer bekommen nur einen Hinweis.
 */
export async function mergeDay(date: string, userId: string): Promise<MergeResult> {
  const dep = await appliedRows<DepartureRow>("DEPARTURES", date, true);
  if (!dep) throw new Error(`Für den ${date} sind keine Departures übernommen. Bitte zuerst importieren.`);
  const arr = await appliedRows<ArrivalRow>("ARRIVALS", date, false);
  const trc = await appliedRows<TraceRow>("TRACES", date, false);
  const issues: ParseIssue[] = [];
  if (!arr) issues.push(issue("WARNING", "NO_ARRIVALS", "Keine Arrivals übernommen — Anreisen heute fehlen im Plan (Frühanreisen stehen evtl. in den Departures)."));
  else if (arr.batch.businessDate !== date) issues.push(issue("WARNING", "ARRIVALS_OTHER_DAY", `Die Arrivals-Liste gilt für den ${arr.batch.businessDate}, nicht für ${date}. Nur Anreisen vom ${date} werden berücksichtigt.`));

  const rooms = await prisma.room.findMany({ select: { id: true, number: true, lastLinenChangeAt: true, assignedToId: true } });
  const roomByNumber = new Map(rooms.map((r) => [r.number, r]));
  const known = <T extends { room: string }>(rows: T[]) => {
    const unknown = [...new Set(rows.filter((r) => !roomByNumber.has(r.room)).map((r) => r.room))];
    if (unknown.length) issues.push(issue("WARNING", "UNKNOWN_ROOM", `Zimmer nicht im Zimmerstamm, übersprungen: ${unknown.sort().join(", ")}.`));
    return rows.filter((r) => roomByNumber.has(r.room));
  };
  const departures = known(dep.rows);
  const arrivals = known(arr?.rows ?? []);

  const settings = await getPlanningCreditSettings();
  const derived = deriveDayPlan({
    date, departures, arrivals, linenCycleDays: settings.linenCycleDays,
    lastLinenChange: Object.fromEntries(rooms.map((r) => [r.number, r.lastLinenChangeAt ? r.lastLinenChangeAt.toISOString().slice(0, 10) : null])),
  });
  issues.push(...derived.issues);

  // ── Aufenthalte (Stay): Schlüssel = Zimmer + Anreisedatum ────────────────
  const guestOf = new Map<string, GuestName>();
  for (const r of [...departures, ...arrivals]) guestOf.set(`${r.room}|${r.arrDate}`, r.guest);
  const seen = new Set<string>();
  const stayIdByKey = new Map<string, string>();
  const now = new Date();
  for (const s of derived.stays) {
    const room = roomByNumber.get(s.room)!;
    const key = `${s.room}|${s.arrDate}`;
    seen.add(key);
    const from = utcDay(s.arrDate), to = new Date(from.getTime() + 86_400_000);
    const existing = await prisma.stay.findFirst({ where: { roomId: room.id, checkIn: { gte: from, lt: to } } });
    const g = guestOf.get(key);
    const data = {
      guestName: g ? shortName(g) : "—", checkOut: new Date(`${s.depDate}T10:00:00Z`),
      status: s.status === "CKIN" || s.status === "DUOT" ? "IN_HOUSE" : "EXPECTED",
      adults: s.adults, children: s.children, vip: s.vip, arrivalTime: s.arrTime, resStatus: s.status,
      needsReview: false, lastImportAt: now,
    };
    const stay = existing
      ? await prisma.stay.update({ where: { id: existing.id }, data: existing.source === "IMPORT" ? data : { needsReview: false, lastImportAt: now } })
      : await prisma.stay.create({ data: { ...data, roomId: room.id, checkIn: from, language: "de", stayToken: generateOpaqueToken(), source: "IMPORT" } });
    stayIdByKey.set(key, stay.id);
  }
  // Aufenthalte, die in diesem Stand fehlen: markieren, nie löschen.
  const open = await prisma.stay.findMany({ where: { source: "IMPORT", status: { in: ["EXPECTED", "IN_HOUSE"] }, checkOut: { gte: utcDay(date) } }, include: { room: { select: { number: true } } } });
  const missing = open.filter((s) => !seen.has(`${s.room.number}|${s.checkIn.toISOString().slice(0, 10)}`));
  if (missing.length) {
    await prisma.stay.updateMany({ where: { id: { in: missing.map((s) => s.id) } }, data: { needsReview: true } });
    issues.push(issue("WARNING", "STAY_MISSING", `${missing.length} bekannte Aufenthalt(e) stehen in diesem Stand nicht mehr in den Listen (Zimmer ${missing.map((s) => s.room.number).sort().join(", ")}) — zur Prüfung markiert, nicht gelöscht.`));
  }

  // ── Tagesplan (DayRoomPlan) ──────────────────────────────────────────────
  const existingPlan = await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: { select: { number: true, assignedToId: true } } } });
  const oldByRoom = new Map(existingPlan.map((p) => [p.room.number, p]));
  const newByRoom = new Map(derived.rooms.map((r) => [r.room, r]));
  let changedAssigned = 0;
  const notify = async (roomNumber: string, roomId: string, from: string, to: string) => {
    changedAssigned++;
    const message = `Zimmer ${roomNumber}: Reinigungsart nach Nachimport geändert (${from} → ${to}). Zuteilung bleibt unverändert — bitte prüfen.`;
    for (const targetRole of ["supervisor", "room_attendant"]) {
      const dedupeKey = `DAYPLAN:${date}:${roomNumber}:${to}:${targetRole}`;
      if (await prisma.notification.findFirst({ where: { dedupeKey } })) continue; // gleiche Meldung schon vorhanden
      const n = await prisma.notification.create({ data: { type: "DAY_PLAN_CHANGED", level: "warning", targetRole, roomId, message, dedupeKey } });
      broadcast("notification:new", { notification: n });
    }
  };
  for (const [number, old] of oldByRoom) {
    const nu = newByRoom.get(number);
    if (old.typeOverridden) continue;
    if (!nu && old.room.assignedToId) await notify(number, old.roomId, old.cleaningType, "—");
    else if (nu && nu.cleaningType !== old.cleaningType && old.room.assignedToId) await notify(number, old.roomId, old.cleaningType, nu.cleaningType);
  }
  for (const [number, old] of oldByRoom) if (!newByRoom.has(number) && !old.typeOverridden) await prisma.dayRoomPlan.delete({ where: { id: old.id } });
  for (const r of derived.rooms) {
    const room = roomByNumber.get(r.room)!;
    const old = oldByRoom.get(r.room);
    const base = {
      laundryDue: r.laundryDue, nights: r.nights, vip: r.vip, eta: r.eta,
      stayId: r.stay ? stayIdByKey.get(`${r.room}|${r.stay}`) ?? null : null,
      arrivingStayId: r.arrivingStay ? stayIdByKey.get(`${r.room}|${r.arrivingStay}`) ?? null : null,
    };
    if (old?.typeOverridden) await prisma.dayRoomPlan.update({ where: { id: old.id }, data: { ...base, derivedType: r.cleaningType } });
    else if (old) await prisma.dayRoomPlan.update({ where: { id: old.id }, data: { ...base, cleaningType: r.cleaningType } });
    else await prisma.dayRoomPlan.create({ data: { ...base, date, roomId: room.id, cleaningType: r.cleaningType } });
  }

  // Forecast-Gegenprobe (nur Warnung)
  const fc = await prisma.forecastDay.findUnique({ where: { date } });
  issues.push(...compareWithForecast(derived.figures, fc ? { date, occupiedRooms: fc.occupiedRooms, arrivals: fc.arrivals, departures: fc.departures } : null));

  // ── Traces ───────────────────────────────────────────────────────────────
  const deptMap = await getTraceDeptMap();
  const candidates = [
    ...arrivals.flatMap((a) => a.traces.map((t) => ({ room: a.room, code: t.code, date: t.date, text: t.text, source: "ARRIVALS" }))),
    ...known(trc?.rows ?? []).map((t) => ({ room: t.room, code: t.code, date: t.date, text: t.text, source: "TRACES" })),
  ];
  const unknownCodes = new Set<string>();
  let newTraces = 0;
  for (const c of candidates) {
    const dedupeKey = `${c.room}|${c.code}|${c.date}|${c.text}`;
    if (await prisma.trace.findUnique({ where: { dedupeKey } })) continue; // erledigte bleiben erledigt
    const classified = classifyTraceText(c.text);
    const code = c.code.toUpperCase();
    if (!classified && !(code in deptMap)) unknownCodes.add(code);
    await prisma.trace.create({ data: {
      roomId: roomByNumber.get(c.room)!.id, code: c.code, date: c.date, text: c.text, source: c.source, dedupeKey,
      dept: classified ? "HOUSEMAN" : deptMap[code] ?? "HOUSEKEEPING",
    } });
    newTraces++;
  }
  if (unknownCodes.size) issues.push(issue("WARNING", "UNKNOWN_TRACE_CODE",
    `Unbekannte Trace-Codes (${[...unknownCodes].sort().join(", ")}): Housekeeping vorbelegt. Zuordnung unter Einstellungen "traceDept.<CODE>" ergänzen. Bekannt: ${Object.keys(TRACE_DEPT_DEFAULTS).join(", ")}.`));

  // Bett-Traces → Hausmann-Aufgabe. Twin-Rückbau erst, wenn das Zimmer heute abreist.
  let roomTasks = 0;
  const departingToday = new Set(derived.rooms.filter((r) => r.cleaningType === "DEPARTURE" || r.cleaningType === "SAME_DAY_TURN").map((r) => r.room));
  const pending = await prisma.trace.findMany({ where: { status: "OPEN", roomTaskId: null, dept: "HOUSEMAN" }, include: { room: { select: { id: true, number: true } } } });
  for (const t of pending) {
    const task = classifyTraceText(t.text);
    if (!task) continue;
    if (task.type === "TWIN_REVERT" && !departingToday.has(t.room.number)) continue;
    const rt = await createRoomTask({ room: t.room, type: task.type, note: task.note ?? null, createdById: userId });
    await prisma.trace.update({ where: { id: t.id }, data: { roomTaskId: rt.id } });
    roomTasks++;
  }

  await audit({ action: "DAY_PLAN_MERGED", userId, meta: { date, figures: derived.figures, newTraces, roomTasks, issues: issues.length } });
  return {
    date, figures: derived.figures, issues,
    counts: { stays: derived.stays.length, staysNeedingReview: missing.length, traces: newTraces, roomTasks, changedAssigned },
  };
}

/**
 * Tagesplan auf das Board übernehmen: setzt die Felder, die Planungshub,
 * Grundriss und Wäschelogik schon lesen (isCheckoutToday, occupancy, Arrival,
 * lastLinenChangeAt). Zuteilungen und Statusfelder bleiben unberührt.
 */
export async function applyDayPlanToBoard(date: string, userId: string) {
  const plan = await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: true } });
  if (!plan.length) throw new Error(`Für den ${date} gibt es keinen Tagesplan. Bitte zuerst berechnen.`);
  const dep = await prisma.importBatch.findFirst({ where: { type: "DEPARTURES", status: "APPLIED", businessDate: date }, orderBy: { appliedAt: "desc" } });
  const complete = !!dep?.periodTo && diffDays(date, dep.periodTo) >= DEPARTURES_MIN_HORIZON_DAYS;
  const notes: string[] = [];
  const planned = new Set(plan.map((p) => p.roomId));
  let changed = 0;

  for (const p of plan) {
    const checkout = p.cleaningType === "DEPARTURE" || p.cleaningType === "SAME_DAY_TURN";
    const arrivingStay = p.arrivingStayId ? await prisma.stay.findUnique({ where: { id: p.arrivingStayId } }) : null;
    const occupied = p.cleaningType !== "ARRIVAL" || arrivingStay?.status === "IN_HOUSE";
    const data: { isCheckoutToday: boolean; occupancy: string; lastLinenChangeAt?: Date } = { isCheckoutToday: checkout, occupancy: occupied ? "OCCUPIED" : "VACANT" };
    if (p.cleaningType === "STAYOVER" && p.stayId) {
      const stay = await prisma.stay.findUnique({ where: { id: p.stayId } });
      if (stay && (!p.room.lastLinenChangeAt || p.room.lastLinenChangeAt < stay.checkIn)) data.lastLinenChangeAt = stay.checkIn; // Zähler ab Anreise
    }
    if (p.room.isCheckoutToday !== data.isCheckoutToday || p.room.occupancy !== data.occupancy || data.lastLinenChangeAt) {
      const room = await prisma.room.update({ where: { id: p.roomId }, data });
      broadcast("room:update", { room });
      changed++;
    }
  }
  if (complete) {
    const others = await prisma.room.findMany({ where: { id: { notIn: [...planned] }, OR: [{ isCheckoutToday: true }, { occupancy: "OCCUPIED" }] } });
    for (const r of others) {
      const room = await prisma.room.update({ where: { id: r.id }, data: { isCheckoutToday: false, occupancy: "VACANT" } });
      broadcast("room:update", { room });
      changed++;
    }
  } else {
    notes.push("Departures-Zeitraum kürzer als 30 Tage: Zimmer ohne Eintrag bleiben unverändert (könnten Langzeitgäste sein).");
  }

  // Erwartete Anreisen (Arrival) aus der Liste; manuell angelegte bleiben, frühere Import-Anreisen werden ersetzt.
  await prisma.arrival.deleteMany({ where: { source: "IMPORT", status: "EXPECTED" } });
  let arrivalsCreated = 0;
  for (const p of plan.filter((x) => x.arrivingStayId)) {
    const stay = await prisma.stay.findUnique({ where: { id: p.arrivingStayId! } });
    if (!stay || stay.status === "IN_HOUSE") continue; // schon eingecheckt (Frühanreise)
    await prisma.arrival.create({ data: {
      roomId: p.roomId, guestName: stay.guestName, eta: stay.arrivalTime ? berlinToUtc(date, stay.arrivalTime) : null,
      vip: stay.vip, status: "EXPECTED", source: "IMPORT", createdById: userId,
    } });
    arrivalsCreated++;
  }
  await audit({ action: "DAY_PLAN_APPLIED", userId, meta: { date, rooms: plan.length, changedRooms: changed, arrivalsCreated } });
  broadcast("arrival:update", {});
  return { rooms: plan.length, changedRooms: changed, arrivalsCreated, notes };
}

/** Reinigungsart eines Zimmers manuell ändern (Supervisor); der Listen-Wert bleibt in derivedType erhalten. */
export async function overrideCleaningType(date: string, roomNumber: string, cleaningType: DayCleaningType, userId: string) {
  const row = await prisma.dayRoomPlan.findFirst({ where: { date, room: { number: roomNumber } } });
  if (!row) throw new Error("Zimmer nicht im Tagesplan.");
  const derivedType = row.typeOverridden ? row.derivedType : row.cleaningType;
  const same = cleaningType === derivedType;
  const updated = await prisma.dayRoomPlan.update({ where: { id: row.id }, data: { cleaningType, typeOverridden: !same, derivedType: same ? null : derivedType } });
  await audit({ action: "CLEANING_TYPE_CHANGED", userId, roomId: row.roomId, meta: { date, from: row.cleaningType, to: cleaningType } });
  return updated;
}
