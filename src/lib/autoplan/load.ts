import { prisma } from "@/lib/db";
import { isToClean, PLAN_KIND } from "@/lib/dayplan/dayNumbers";
import { getAutoplanWeights, getPlanningCreditSettings, getRoomTypeCredits, getSettings } from "@/lib/settings";
import { berlinToUtc } from "@/lib/dayplan/time";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import type { RoomType } from "@/lib/domain";
import { savedTeamFor } from "@/lib/planung/savedTeam";
import { estimateSpeeds } from "./speed";
import type { LiveInput } from "./redistribute";
import type { Assignment, DemandingReason, HkType, PlanHousekeeper, PlanInput, PlanRoom, RoomState } from "./types";
import { parseRestrictions } from "./types";
import type { SettingsShape } from "@/lib/domain";
import { bandTarget, roomBand } from "@/lib/planung/floorTeam";
import { parseAssignedFloors } from "@/lib/floors";
import { activePatterns } from "@/lib/learning/store";
import { planningMinutesFor } from "@/lib/workdata/load";
import { lastCleanerByStay, type StayRef } from "@/lib/learning/stayContinuity";
import { greenRoomsOn } from "@/lib/guest/green";

import { SUITE_TYPES } from "./types";
export { SUITE_TYPES };
/** Zimmer in diesen Status werden nicht gereinigt/zugeteilt. */
const NOT_CLEANED = new Set(["OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT"]);

export interface DayData {
  date: string;
  /** Alle heutigen Arbeits-Zimmer (jeder Status). */
  rooms: PlanRoom[];
  /** Aktuelle heutige Zuteilung (nur wenn heute gesetzt oder schon begonnen). */
  current: Assignment;
  hks: (PlanHousekeeper & { present: boolean; absent: boolean })[];
  settings: SettingsShape;
  weights: Awaited<ReturnType<typeof getAutoplanWeights>>;
  fullTimeTarget: number;
  /** H3: gelernte Muster, die eine harte Regel verletzen würden — nur als Hinweis, nicht angewendet. */
  learnedNotes: string[];
  /** DB-Zustand der Zimmer, um vor dem Anwenden zu prüfen, ob inzwischen etwas begonnen wurde. */
  roomState: Record<string, { number: string; state: RoomState; assignedToId: string | null; assignedOn: string | null }>;
}

const stateOf = (status: string): RoomState => (status === "IN_PROGRESS" ? "STARTED" : status === "CLEAN" || status === "INSPECTED" ? "DONE" : "TODO");

/**
 * Credit-Band einer Kraft (Gegenprobe zur Zimmerzahl). Planung L1 (Meeting 13.11.): Credit-Ziel = Zimmer-Ziel der Kraft
 * (Obergrenze ihres Bands, also je nach Status Vollzeit/Teilzeit/Azubi) × durchschnittlicher Credit des Tages, Toleranz
 * ± `tolerance` (Setting `creditTolerance`, Standard 1,5). Ohne Toleranz wie bisher: Zimmer-Band × Ø Credit.
 */
export function bandFor(rooms: { lo: number; hi: number }, avgCredit: number, tolerance?: number): { lo: number; hi: number } {
  const r = (n: number) => Math.round(n * 100) / 100;
  if (tolerance !== undefined && tolerance > 0) {
    const target = rooms.hi * avgCredit;
    return { lo: r(Math.max(0, target - tolerance)), hi: r(target + tolerance) };
  }
  return { lo: r(rooms.lo * avgCredit), hi: r(rooms.hi * avgCredit) };
}

const floors = (csv: string) => csv.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)).slice(0, 2);

/**
 * Die im Planungshub gewählte Mannschaft des Tages: bei bestätigtem Plan dessen Kräfte, sonst die gespeicherte Teamauswahl.
 * `null` = noch keine Auswahl (dann zählen alle Anwesenden). Die Planung rechnet nie mit anderen Kräften — auch Bestätigen
 * und Umverteilung erweitern die Auswahl nicht.
 */
export async function teamIdsFor(date: string): Promise<string[] | null> {
  const conf = await prisma.autoPlanProposal.findFirst({ where: { date, status: "CONFIRMED" }, orderBy: { confirmedAt: "desc" } });
  if (conf) {
    try { return (JSON.parse(conf.payload) as { input: PlanInput }).input.housekeepers.map((h) => h.id); } catch { /* weiter mit Teamauswahl */ }
  }
  const saved = await savedTeamFor(date);
  if (saved) return saved.hk;
  return null;
}

export async function loadDay(date: string, opts: { attendantIds?: string[] } = {}): Promise<DayData> {
  const [settings, planning, typeCredits, weights] = await Promise.all([getSettings(), getPlanningCreditSettings(), getRoomTypeCredits(), getAutoplanWeights()]);
  const fullTimeTarget = planning.targetCreditsPerAttendant;

  // Dieselbe Regel wie die Tageszahlen (isToClean): Abreisen, Turns, alle Bleiber und Anreisen in noch nicht gereinigte Zimmer.
  const plan = (await prisma.dayRoomPlan.findMany({ where: { date }, include: { room: true } }))
    .filter((p) => isToClean(PLAN_KIND[p.cleaningType], p.room.status));
  const traces = await prisma.trace.groupBy({ by: ["roomId"], where: { status: "OPEN" }, _count: true });
  const traceCount = new Map(traces.map((t) => [t.roomId, t._count]));
  const idByNumber = new Map(plan.map((p) => [p.room.number, p.roomId]));
  // Betrieb L2 (Punkt 11): Green Option heute → kein Wäschewechsel
  const green = await greenRoomsOn(date);

  const rooms: PlanRoom[] = [];
  const current: Assignment = {};
  const roomState: DayData["roomState"] = {};
  /** Planung L1 (Regel 13): Bleiber-Zimmer → Aufenthalt (nur Ids). */
  const stayOfRoom = new Map<string, string>();
  for (const p of plan) {
    const r = p.room;
    if (NOT_CLEANED.has(r.status)) continue;
    const state = stateOf(r.status);
    const today = r.assignedOn === date;
    const assignee = r.assignedToId && (today || state !== "TODO") ? r.assignedToId : null;
    if (state !== "TODO" && !assignee) continue; // schon erledigt/begonnen, niemandem zugeordnet: nichts zu planen
    // Plan-1b: Turn = Anreise und Abreise (auch Anreise in ein nicht gereinigtes Zimmer); DEPARTURE = Deep clean (Abreise ohne Anreise heute)
    const kind = p.cleaningType === "SAME_DAY_TURN" || p.cleaningType === "ARRIVAL" ? "TURN" : p.cleaningType === "STAYOVER" ? "STAYOVER" : "DEPARTURE";
    const credits = computeRoomCredit({ type: r.type as RoomType, credits: typeCredits, roomCredit: r.credit }); // Plan-1b: Wert der Zimmerkategorie
    const traceN = traceCount.get(r.id) ?? 0;
    const demanding: DemandingReason[] = [];
    if (p.vip) demanding.push("VIP");
    if ((SUITE_TYPES as readonly string[]).includes(r.type)) demanding.push("SUITE");
    if (r.isAntiAllergic) demanding.push("ALLERGY");
    if (traceN >= settings.autoplanManyTraces) demanding.push("TRACES");
    const interconnect = (r.interconnectingGroup ?? "").split(",").map((n) => idByNumber.get(n.trim())).filter((x): x is string => !!x);
    rooms.push({
      id: r.id, number: r.number, floor: r.floor, section: r.section, kind, laundry: kind === "STAYOVER" && p.laundryDue && !green.has(r.id),
      vip: p.vip, eta: p.eta, credits, demanding, traces: traceN, interconnect, state, fixedTo: assignee,
    });
    current[r.id] = assignee;
    roomState[r.id] = { number: r.number, state, assignedToId: r.assignedToId, assignedOn: r.assignedOn };
    if (kind === "STAYOVER" && p.stayId) stayOfRoom.set(r.id, p.stayId);
  }

  // Gestern: Etagen der letzten bestätigten Zuteilung vor diesem Tag
  const prev = await prisma.autoPlanProposal.findFirst({ where: { status: "CONFIRMED", date: { lt: date } }, orderBy: { date: "desc" } });
  const yesterday = new Map<string, number[]>();
  if (prev) {
    const p = JSON.parse(prev.payload) as { input: PlanInput; result: { assignment: Assignment } };
    const floorOf = new Map(p.input.rooms.map((r) => [r.id, r.floor]));
    for (const [rid, hkId] of Object.entries(p.result.assignment)) {
      if (!hkId || !floorOf.has(rid)) continue;
      yesterday.set(hkId, [...new Set([...(yesterday.get(hkId) ?? []), floorOf.get(rid)!])]);
    }
  }

  const team = opts.attendantIds ?? (await teamIdsFor(date));
  const users = await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, orderBy: { name: "asc" } });
  const avgCredit = rooms.length ? rooms.reduce((a, r) => a + r.credits, 0) / rooms.length : 1;
  const hks = users.map((u) => {
    // Zimmer-Band je Typ bzw. persönliches Tagesziel in Zimmern (dailyTarget); Credits nur als Gegenprobe daraus
    const band = roomBand(u.hkType, settings as unknown as Record<string, number>, u.dailyTarget);
    return {
    id: u.id, name: u.name, type: (u.hkType as HkType), level: Math.min(3, Math.max(1, u.hkLevel)) as 1 | 2 | 3,
    homeFloors: floors(u.homeFloors), yesterdayFloors: yesterday.get(u.id) ?? [],
    ...bandFor(band, avgCredit, settings.creditTolerance),
    roomsLo: band.lo, roomsHi: band.hi,
    restrictions: parseRestrictions(u.hkRestrictions),
    todayFloors: u.floorsOn === date ? parseAssignedFloors(u.assignedFloors) : [],
    absent: u.absentDate === date,
    present: u.absentDate !== date && (!team || team.includes(u.id)),
  };
  });
  const learnedNotes = await applyLearned(date, rooms, hks);
  await applyStayContinuity(date, rooms, stayOfRoom, new Set(users.map((u) => u.id))).catch(() => undefined);
  // H3: gemessene Zeiten (nur wenn „Messdaten in Planung verwenden" an ist) — Credits bleiben die Basis
  const minutes = await planningMinutesFor(date, hks.map((h) => h.id)).catch(() => ({} as Record<string, never>));
  for (const h of hks) if (minutes[h.id]) (h as PlanHousekeeper).minutesByKind = minutes[h.id];
  return { date, rooms, current, hks, settings, weights, fullTimeTarget, roomState, learnedNotes };
}

/**
 * Planung L1 (Regel 13): Bleiber bekommen als weiche Präferenz die Kraft, die beim selben Aufenthalt zuletzt gereinigt hat
 * (abgeleitet aus Stay + Logbuch, siehe `src/lib/learning/stayContinuity.ts`). Feste Zuteilungen bleiben unberührt.
 */
async function applyStayContinuity(date: string, rooms: PlanRoom[], stayOfRoom: Map<string, string>, attendantIds: Set<string>): Promise<void> {
  if (!stayOfRoom.size) return;
  const stays = await prisma.stay.findMany({ where: { id: { in: [...new Set(stayOfRoom.values())] } }, select: { id: true, checkIn: true } });
  const checkInOf = new Map(stays.map((s) => [s.id, s.checkIn]));
  const refs: StayRef[] = [];
  for (const [roomId, stayId] of stayOfRoom) {
    const checkIn = checkInOf.get(stayId);
    if (checkIn) refs.push({ roomId, stayId, checkIn });
  }
  if (!refs.length) return;
  const since = new Date(Math.min(...refs.map((r) => r.checkIn.getTime())));
  const dayStart = berlinToUtc(date, "00:00");
  const events = await prisma.auditLog.findMany({
    where: { action: "STATUS_CHANGE", toStatus: "CLEAN", roomId: { in: refs.map((r) => r.roomId) }, userId: { not: null }, createdAt: { gte: since, lt: dayStart } },
    select: { roomId: true, userId: true, createdAt: true },
  });
  const last = lastCleanerByStay(refs, events.map((e) => ({ roomId: e.roomId!, userId: e.userId!, at: e.createdAt })), dayStart, attendantIds);
  for (const r of rooms) {
    const hk = last.get(r.id);
    if (hk && !r.fixedTo) r.stayHk = hk;
  }
}

/**
 * H3: gelernte Zimmer-Muster als weiche Präferenz eintragen. Harte Regeln gewinnen: ein Muster, das ein anspruchsvolles
 * Zimmer an Stufe 1 geben würde, wird nicht angewendet und nur als Hinweis gezeigt.
 */
async function applyLearned(date: string, rooms: PlanRoom[], hks: { id: string; name: string; level: number }[]): Promise<string[]> {
  const notes: string[] = [];
  const patterns = await activePatterns(date).catch(() => []);
  const byNumber = new Map(rooms.map((r) => [r.number, r]));
  const hkBy = new Map(hks.map((h) => [h.id, h]));
  for (const p of patterns) {
    const r = p.roomNumber ? byNumber.get(p.roomNumber) : undefined;
    if (!r || r.fixedTo) continue;
    const why = `gelernt: an ${p.days} von ${p.of} Planungstagen so geändert`;
    if (p.kind === "ROOM_PERSON" && p.target) {
      const h = hkBy.get(p.target);
      if (!h) continue;
      if (h.level < 2 && r.demanding.length) { notes.push(`Gelerntes Muster für Zimmer ${r.number} nicht angewendet: Stufe-1-Regel geht vor.`); continue; }
      r.preferHk = p.target; r.learnedReason = why;
    } else if (p.kind === "ROOM_LEVEL" && p.minLevel) {
      r.minLevel = Math.max(r.minLevel ?? 0, p.minLevel); r.learnedReason = why;
    }
  }
  return notes;
}

export function morningInput(d: DayData): PlanInput {
  // Zimmer, die heute einer jetzt nicht eingeplanten Kraft gehören (und noch nicht begonnen sind), werden neu verteilt — nie offen gelassen.
  const presentIds = new Set(d.hks.filter((h) => h.present).map((h) => h.id));
  // Begonnene Zimmer einer nicht eingeplanten Kraft bleiben bei ihr und gehören nicht in den Entwurf.
  const rooms = d.rooms
    .filter((r) => !(r.fixedTo && !presentIds.has(r.fixedTo) && r.state !== "TODO"))
    .map((r) => (r.fixedTo && !presentIds.has(r.fixedTo) ? { ...r, fixedTo: null } : r));
  return {
    rooms, housekeepers: d.hks.filter((h) => h.present).map(({ present: _p, absent: _a, ...h }) => (void _p, void _a, h)),
    weights: d.weights, maxFloors: d.settings.autoplanMaxFloors, fullTimeTarget: d.fullTimeTarget,
    fullTimeRooms: bandTarget(roomBand("VOLLZEIT", d.settings as unknown as Record<string, number>)),
    ...(d.hks.some((h) => h.minutesByKind) ? { shiftMinutes: d.settings.shiftMinutes } : {}),
    maxSuites: d.settings.maxSuitesPerHk, suiteMinCredit: d.settings.suiteMinCredit,
  };
}

export async function loadLive(d: DayData): Promise<LiveInput> {
  const dayStart = berlinToUtc(d.date, "00:00");
  const events = await prisma.auditLog.findMany({
    where: { action: "STATUS_CHANGE", createdAt: { gte: dayStart }, toStatus: { in: ["IN_PROGRESS", "CLEAN"] }, userId: { not: null }, roomId: { not: null } },
    select: { userId: true, roomId: true, toStatus: true, createdAt: true },
  });
  const credits = Object.fromEntries(d.rooms.map((r) => [r.id, r.credits]));
  const speeds = estimateSpeeds(
    events.map((e) => ({ hkId: e.userId!, roomId: e.roomId!, toStatus: e.toStatus!, at: e.createdAt.getTime() })), credits, d.settings.minutesPerCredit,
  );
  const strip = ({ present: _p, absent: _a, ...h }: DayData["hks"][number]): PlanHousekeeper => (void _p, void _a, h);
  return {
    rooms: d.rooms, present: d.hks.filter((h) => h.present).map(strip), absent: d.hks.filter((h) => h.absent).map(strip),
    current: d.current, weights: d.weights, maxFloors: d.settings.autoplanMaxFloors, fullTimeTarget: d.fullTimeTarget, speeds,
    minutesPerCredit: d.settings.minutesPerCredit, earlyFinishMinutes: d.settings.earlyFinishMinutes, maxMoves: d.settings.redistributionMaxMoves,
  };
}
