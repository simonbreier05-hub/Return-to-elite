import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { generateOpaqueToken } from "@/lib/guestToken";
import { getPlanningCreditSettings } from "@/lib/settings";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import type { ArrivalRow, DepartureRow, GuestName, ParseIssue, TraceRow } from "@/lib/import/types";
import { createRoomTask } from "@/lib/rooms/createRoomTask";
import { notifyListUpdate, type NewTrace, type RoomChange } from "@/lib/rooms/notifyListUpdate";
import { compareWithForecast, deriveDayPlan, type DayCleaningType, type DayFiguresDerived } from "./derive";
import { berlinToUtc } from "./time";
import { planBoardStatus, type StatusMarker } from "./boardStatus";
import { legacyTraceKey, traceKey } from "./traceKey";
import { getTraceDeptMap, TRACE_DEPT_DEFAULTS } from "./traceDept";

const issue = (severity: ParseIssue["severity"], code: string, message: string, room?: string): ParseIssue => ({ severity, code, message, room });
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Mrs. Testfrau" — Anrede, Titel, Nachname; nie der volle Name in Stay/Arrival. */
const shortName = (g: GuestName) => [g.salutation, g.title, g.lastName].filter(Boolean).join(" ");

async function appliedRows<T>(type: "DEPARTURES" | "ARRIVALS" | "TRACES", date: string, exact: boolean, acceptedOnly = false) {
  const batch = await prisma.importBatch.findFirst({
    where: { type, status: "APPLIED", ...(exact ? { businessDate: date } : {}), ...(acceptedOnly ? { staleAcceptedAt: { not: null } } : {}) },
    orderBy: { appliedAt: "desc" },
    include: { rows: true },
  });
  if (!batch) return null;
  // Nach der Nachtlöschung (M3) sind die Zeilen weg, der Batch bleibt: nicht mit leeren Listen weiterrechnen.
  if (batch.rowCount > 0 && batch.rows.length === 0) return { batch, rows: [] as T[], purged: true };
  return { batch, rows: batch.rows.map((r) => JSON.parse(r.payload) as T), purged: false };
}

export interface MergeResult {
  date: string;
  figures: DayFiguresDerived;
  issues: ParseIssue[];
  counts: { stays: number; staysNeedingReview: number; traces: number; roomTasks: number; changedAssigned: number };
  /** Zimmernummern, deren Art sich gegenüber dem vorigen Stand geändert hat (neu, anders, entfallen) — für die Hervorhebung im Haus. */
  changedRooms: string[];
}

/**
 * Importierte Listen eines Tages zusammenführen: Aufenthalte (Stay), Traces,
 * Tagesplan (DayRoomPlan). Idempotent; ein Nachimport verändert keine
 * Zuteilungen (Room.assignedToId) — betroffene Zimmer bekommen nur einen Hinweis.
 */
export async function mergeDay(date: string, userId: string): Promise<MergeResult> {
  // Departures des Tages; sonst eine im Planungshub als veraltet bestätigte („Trotzdem verwenden") — nie eine unbestätigte ältere.
  const dep = (await appliedRows<DepartureRow>("DEPARTURES", date, true)) ?? (await appliedRows<DepartureRow>("DEPARTURES", date, false, true));
  if (!dep) throw new Error(`Für den ${date} sind keine Departures übernommen. Bitte zuerst importieren.`);
  if (dep.purged) throw new Error("Die Gastdaten wurden gelöscht (Nachtlöschung). Bitte die Listen neu importieren.");
  const arr = await appliedRows<ArrivalRow>("ARRIVALS", date, false);
  const trc = await appliedRows<TraceRow>("TRACES", date, false);
  const issues: ParseIssue[] = [];
  if (arr?.purged) issues.push(issue("WARNING", "ARRIVALS_PURGED", "Die Arrivals wurden nachts gelöscht — bitte neu importieren."));
  else if (!arr) issues.push(issue("WARNING", "NO_ARRIVALS", "Keine Arrivals übernommen — Anreisen heute fehlen im Plan (Frühanreisen stehen evtl. in den Departures)."));
  else if (arr.batch.businessDate !== date) issues.push(issue("WARNING", "ARRIVALS_OTHER_DAY", `Die Arrivals-Liste gilt für den ${arr.batch.businessDate}, nicht für ${date}. Nur Anreisen vom ${date} werden berücksichtigt.`));

  const rooms = await prisma.room.findMany({ select: { id: true, number: true, floor: true, lastLinenChangeAt: true, assignedToId: true } });
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
  const changedRooms = [...new Set([
    ...derived.rooms.filter((r) => oldByRoom.get(r.room)?.cleaningType !== r.cleaningType).map((r) => r.room),
    ...[...oldByRoom.keys()].filter((n) => !newByRoom.has(n)),
  ])];
  // Geänderte Arten (ohne manuell überschriebene) für die Meldungen an die Betroffenen — nach dem Schreiben, einmal je Person
  const typeChanges: RoomChange[] = [];
  for (const [number, old] of oldByRoom) {
    const nu = newByRoom.get(number);
    if (old.typeOverridden) continue;
    const r = roomByNumber.get(number);
    if (!r) continue;
    if (!nu) typeChanges.push({ number, floor: r.floor, roomId: old.roomId, from: old.cleaningType, to: "—" });
    else if (nu.cleaningType !== old.cleaningType) typeChanges.push({ number, floor: r.floor, roomId: old.roomId, from: old.cleaningType, to: nu.cleaningType });
  }
  changedAssigned = typeChanges.filter((c) => !!roomByNumber.get(c.number)?.assignedToId).length;
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
  const createdTraces: NewTrace[] = [];
  for (const c of candidates) {
    const dedupeKey = traceKey(c.room, c.code, c.date, c.text);
    const existing = (await prisma.trace.findUnique({ where: { dedupeKey } }))
      ?? (await prisma.trace.findUnique({ where: { dedupeKey: legacyTraceKey(c.room, c.code, c.date, c.text) } }));
    if (existing) { // erledigte bleiben erledigt; nach der Nachtlöschung kommt nur der Text zurück
      if (existing.text === "") await prisma.trace.update({ where: { id: existing.id }, data: { text: c.text } });
      continue;
    }
    const classified = classifyTraceText(c.text);
    const code = c.code.toUpperCase();
    if (!classified && !(code in deptMap)) unknownCodes.add(code);
    await prisma.trace.create({ data: {
      roomId: roomByNumber.get(c.room)!.id, code: c.code, date: c.date, text: c.text, source: c.source, dedupeKey,
      dept: classified ? "HOUSEMAN" : deptMap[code] ?? "HOUSEKEEPING",
    } });
    newTraces++;
    createdTraces.push({ number: c.room, floor: roomByNumber.get(c.room)!.floor, dept: classified ? "HOUSEMAN" : deptMap[code] ?? "HOUSEKEEPING" });
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

  // Jede betroffene Person erfährt von Änderungen ihrer Liste (nicht beim allerersten Import des Tages)
  if (existingPlan.length > 0) await notifyListUpdate({ date, actorId: userId, changes: typeChanges, newTraces: createdTraces, source: "IMPORT" });
  await audit({ action: "DAY_PLAN_MERGED", userId, meta: { date, figures: derived.figures, newTraces, roomTasks, issues: issues.length, changedRooms, first: existingPlan.length === 0 } });
  return {
    date, figures: derived.figures, issues, changedRooms,
    counts: { stays: derived.stays.length, staysNeedingReview: missing.length, traces: newTraces, roomTasks, changedAssigned },
  };
}

/** Morgendlicher Zimmerstatus (siehe boardStatus.ts): alle sauber, nur nachweislich belegte/belegt gewesene schmutzig. */
async function initRoomStatus(date: string, plan: { roomId: string; cleaningType: string }[], inHouseRooms: Set<string>, userId: string) {
  const rooms = await prisma.room.findMany({ select: { id: true, number: true, status: true, statusSince: true } });
  const needs = new Set(plan.filter((p) => p.cleaningType === "DEPARTURE" || p.cleaningType === "SAME_DAY_TURN" || p.cleaningType === "STAYOVER").map((p) => p.roomId));
  for (const r of rooms) if (inHouseRooms.has(r.number)) needs.add(r.id);
  const key = `boardInit:${date}`;
  const stored = await prisma.setting.findUnique({ where: { key } });
  const old: StatusMarker = stored ? JSON.parse(stored.value) : {};
  const { updates, marker } = planBoardStatus({ rooms, needsCleaning: needs, marker: old, dayStart: berlinToUtc(date, "00:00") });
  const now = new Date();
  for (const u of updates) {
    const room = await prisma.room.update({ where: { id: u.id }, data: { status: u.status, statusSince: now, blockReason: null, blockedSince: null, reworkNote: null } });
    marker[u.id] = [room.status, room.statusSince.toISOString()];
    broadcast("room:update", { room });
  }
  const value = JSON.stringify(marker);
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await prisma.setting.deleteMany({ where: { key: { startsWith: "boardInit:", not: key } } });
  if (updates.length) {
    const dirty = updates.filter((u) => u.status === "DIRTY").length;
    await audit({ action: "BOARD_STATUS_INIT", userId, meta: { date, dirty, inspected: updates.length - dirty } });
  }
}

/**
 * Tagesplan auf das Board übernehmen: setzt die Felder, die Planungshub,
 * Grundriss und Wäschelogik schon lesen (isCheckoutToday, occupancy, Arrival,
 * lastLinenChangeAt) und setzt den morgendlichen Zimmerstatus (alle sauber, nur nachweislich belegte schmutzig).
 * Zuteilungen bleiben unberührt; was heute schon bearbeitet wurde, behält seinen Status.
 */
export async function applyDayPlanToBoard(date: string, userId: string) {
  const plan = await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: true } });
  if (!plan.length) throw new Error(`Für den ${date} gibt es keinen Tagesplan. Bitte zuerst berechnen.`);
  // Belegung der Zimmer ohne Reinigung heute: aus der In-House-Liste (Tagesbelegung) des Planungshubs — nie ein alter Board-Stand.
  const inhouse = await prisma.importBatch.findFirst({ where: { type: "INHOUSE", status: "APPLIED" }, orderBy: { appliedAt: "desc" }, include: { rows: true } });
  const inHouseRooms = new Set((inhouse?.rows ?? []).map((r) => r.room).filter((n): n is string => !!n));
  const notes: string[] = [];
  if (!inhouse) notes.push("Keine In-House-Liste: Zimmer ohne Eintrag im Tagesplan gelten als frei.");
  else if (inhouse.rowCount > 0 && !inhouse.rows.length) notes.push("In-House-Liste nachts gelöscht: Zimmer ohne Eintrag im Tagesplan gelten als frei — bitte neu einlesen.");
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
  // Alle anderen Zimmer: keine Abreise heute (sonst stünden sie in den Departures), belegt nur laut In-House-Liste.
  for (const r of await prisma.room.findMany({ where: { id: { notIn: [...planned] } } })) {
    const occupancy = inHouseRooms.has(r.number) ? "OCCUPIED" : "VACANT";
    if (!r.isCheckoutToday && r.occupancy === occupancy) continue;
    const room = await prisma.room.update({ where: { id: r.id }, data: { isCheckoutToday: false, occupancy } });
    broadcast("room:update", { room });
    changed++;
  }

  await initRoomStatus(date, plan, inHouseRooms, userId);

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
  const room = await prisma.room.findUnique({ where: { id: row.roomId }, select: { number: true, floor: true } });
  if (room && row.cleaningType !== cleaningType) await notifyListUpdate({ date, actorId: userId, changes: [{ number: room.number, floor: room.floor, roomId: row.roomId, from: row.cleaningType, to: cleaningType }], newTraces: [], source: "MANUAL" });
  return updated;
}
