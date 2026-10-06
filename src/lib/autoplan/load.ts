import { prisma } from "@/lib/db";
import { getAutoplanWeights, getPlanningCreditSettings, getRoomTypeCredits, getSettings } from "@/lib/settings";
import { berlinToUtc } from "@/lib/dayplan/time";
import { estimateSpeeds } from "./speed";
import type { LiveInput } from "./redistribute";
import type { Assignment, DemandingReason, HkType, PlanHousekeeper, PlanInput, PlanRoom, RoomState } from "./types";
import type { SettingsShape } from "@/lib/domain";

/** Zimmertypen, die als "Suite" (anspruchsvoll) gelten — offene Frage 3 im Interview: alle Suiten oder nur höhere? */
export const SUITE_TYPES = ["JUNIOR_SUITE", "SUITE", "PENTHOUSE"] as const;
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
  /** DB-Zustand der Zimmer, um vor dem Anwenden zu prüfen, ob inzwischen etwas begonnen wurde. */
  roomState: Record<string, { number: string; state: RoomState; assignedToId: string | null; assignedOn: string | null }>;
}

const stateOf = (status: string): RoomState => (status === "IN_PROGRESS" ? "STARTED" : status === "CLEAN" || status === "INSPECTED" ? "DONE" : "TODO");

export function bandFor(u: { hkType: string; dailyTarget: number | null }, s: SettingsShape, fullTimeTarget: number): { lo: number; hi: number } {
  if (u.dailyTarget && u.dailyTarget > 0) {
    const tol = u.hkType === "VOLLZEIT" ? s.autoplanTolerance : 1;
    return { lo: Math.max(0, u.dailyTarget - tol), hi: u.dailyTarget + tol };
  }
  if (u.hkType === "AZUBI") return { lo: s.azubiCreditsMin, hi: s.azubiCreditsMax };
  if (u.hkType === "TEILZEIT") return { lo: s.teilzeitCreditsMin, hi: s.teilzeitCreditsMax };
  return { lo: fullTimeTarget - s.autoplanTolerance, hi: fullTimeTarget + s.autoplanTolerance };
}

const floors = (csv: string) => csv.split(",").map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)).slice(0, 2);

export async function loadDay(date: string, opts: { attendantIds?: string[] } = {}): Promise<DayData> {
  const [settings, planning, typeCredits, weights] = await Promise.all([getSettings(), getPlanningCreditSettings(), getRoomTypeCredits(), getAutoplanWeights()]);
  const fullTimeTarget = planning.targetCreditsPerAttendant;

  const plan = await prisma.dayRoomPlan.findMany({ where: { date, cleaningType: { in: ["DEPARTURE", "SAME_DAY_TURN", "STAYOVER"] } }, include: { room: true } });
  const traces = await prisma.trace.groupBy({ by: ["roomId"], where: { status: "OPEN" }, _count: true });
  const traceCount = new Map(traces.map((t) => [t.roomId, t._count]));
  const idByNumber = new Map(plan.map((p) => [p.room.number, p.roomId]));

  const rooms: PlanRoom[] = [];
  const current: Assignment = {};
  const roomState: DayData["roomState"] = {};
  for (const p of plan) {
    const r = p.room;
    if (NOT_CLEANED.has(r.status)) continue;
    const state = stateOf(r.status);
    const today = r.assignedOn === date;
    const assignee = r.assignedToId && (today || state !== "TODO") ? r.assignedToId : null;
    if (state !== "TODO" && !assignee) continue; // schon erledigt/begonnen, niemandem zugeordnet: nichts zu planen
    const kind = p.cleaningType === "SAME_DAY_TURN" ? "TURN" : p.cleaningType === "DEPARTURE" ? "DEPARTURE" : "STAYOVER";
    const factor = kind === "STAYOVER" ? settings.stayoverFactor : 1; // Bleiber: 0,7 × Zimmertyp (Wäschewechsel vorerst gleich, getrennt gezählt)
    const credits = Math.round((typeCredits[r.type as keyof typeof typeCredits] ?? 1) * factor * 100) / 100;
    const traceN = traceCount.get(r.id) ?? 0;
    const demanding: DemandingReason[] = [];
    if (p.vip) demanding.push("VIP");
    if ((SUITE_TYPES as readonly string[]).includes(r.type)) demanding.push("SUITE");
    if (r.isAntiAllergic) demanding.push("ALLERGY");
    if (traceN >= settings.autoplanManyTraces) demanding.push("TRACES");
    const interconnect = (r.interconnectingGroup ?? "").split(",").map((n) => idByNumber.get(n.trim())).filter((x): x is string => !!x);
    rooms.push({
      id: r.id, number: r.number, floor: r.floor, section: r.section, kind, laundry: kind === "STAYOVER" && p.laundryDue,
      vip: p.vip, eta: p.eta, credits, demanding, traces: traceN, interconnect, state, fixedTo: assignee,
    });
    current[r.id] = assignee;
    roomState[r.id] = { number: r.number, state, assignedToId: r.assignedToId, assignedOn: r.assignedOn };
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

  const users = await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, orderBy: { name: "asc" } });
  const hks = users.map((u) => ({
    id: u.id, name: u.name, type: (u.hkType as HkType), level: Math.min(3, Math.max(1, u.hkLevel)) as 1 | 2 | 3,
    homeFloors: floors(u.homeFloors), yesterdayFloors: yesterday.get(u.id) ?? [],
    ...bandFor({ hkType: u.hkType, dailyTarget: u.dailyTarget }, settings, fullTimeTarget),
    absent: u.absentDate === date,
    present: u.absentDate !== date && (!opts.attendantIds || opts.attendantIds.includes(u.id)),
  }));
  return { date, rooms, current, hks, settings, weights, fullTimeTarget, roomState };
}

export function morningInput(d: DayData): PlanInput {
  return {
    rooms: d.rooms, housekeepers: d.hks.filter((h) => h.present).map(({ present: _p, absent: _a, ...h }) => (void _p, void _a, h)),
    weights: d.weights, maxFloors: d.settings.autoplanMaxFloors, fullTimeTarget: d.fullTimeTarget,
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
