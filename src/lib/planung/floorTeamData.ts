import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { addDays } from "@/lib/import/dates";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { parseAssignedFloors, serializeAssignedFloors } from "@/lib/floors";
import { assignFloors } from "@/lib/users/assignFloors";
import { loadDay } from "@/lib/autoplan/load";
import { getSettings } from "@/lib/settings";
import { PLAN_FLOORS } from "./team";
import { activePatterns, recordFloorDeviations } from "@/lib/learning/store";
import { supervisorBadges, type HouseSupervisor } from "./model";
import {
  floorDiff, resolveSuggestions, roomBand,
  type FloorAssign, type FloorLoad, type FloorReason, type Person, type Suggestion, type TeamRole, type WorkDay,
} from "./floorTeam";

/**
 * DB-Seite der Etagenzuweisung für das ganze Team (Planungstool Schritt 3).
 * Enthält Stufe/Typ der Housekeeper (Beschäftigtendaten): nur hinter `requireRole(["supervisor"])` aufrufen
 * (Allow-List in tests/autoplan/privacy.test.ts); Stufe/Typ nie ins AuditLog.
 *
 * Speicherung: `User.assignedFloors` für alle Rollen. Supervisor-Etagen gelten dauerhaft (wie bisher),
 * Housekeeper/Hausmann nur am Tag `User.floorsOn`.
 */
const TEAM_KEY = "planningTeam";
/** So weit zurück wird nach Einsatztagen gesucht (die Regel zählt davon nur die letzten N Einsatztage). */
export const HISTORY_LOOKBACK_DAYS = 45;

export interface FloorPerson {
  id: string; name: string; role: TeamRole;
  /** Nur Housekeeper (Beschäftigtendaten, nur Supervisor sehen das). */
  level?: number; kind?: string; roomsLo?: number; roomsHi?: number;
  badge?: HouseSupervisor;
}
export interface FloorTeamState {
  date: string;
  people: FloorPerson[];
  loads: FloorLoad[];
  /** Stand heute (Supervisor: dauerhaft; Housekeeper/Hausmann: nur wenn floorsOn = heute). */
  assign: FloorAssign;
  suggestions: Suggestion[];
  rules: { window: number; minDays: number; demandingShare: number; maxFloors: number };
}

async function savedTeam(date: string): Promise<{ hk: string[]; sup: string[]; hm: string[] } | null> {
  const row = await prisma.setting.findUnique({ where: { key: TEAM_KEY } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as { date?: string; hk?: string[]; sup?: string[]; hm?: string[] };
    if (v.date !== date) return null;
    return { hk: (v.hk ?? []).map(String), sup: (v.sup ?? []).map(String), hm: (v.hm ?? []).map(String) };
  } catch { return null; }
}

/** Einsatztage aus tatsächlicher Arbeit: Housekeeper = Zimmer auf CLEAN gesetzt, Supervisor = INSPECTED, Hausmann = Aufgabe erledigt. */
export async function loadHistory(people: { id: string; role: TeamRole }[], date: string): Promise<Record<string, WorkDay[]>> {
  const since = berlinToUtc(addDays(date, -HISTORY_LOOKBACK_DAYS), "00:00");
  const until = berlinToUtc(date, "00:00");
  const ids = (r: TeamRole) => people.filter((p) => p.role === r).map((p) => p.id);
  const [events, tasks, rooms] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: "STATUS_CHANGE", createdAt: { gte: since, lt: until }, roomId: { not: null },
        OR: [{ toStatus: "CLEAN", userId: { in: ids("HK") } }, { toStatus: "INSPECTED", userId: { in: ids("SUP") } }] },
      select: { userId: true, roomId: true, createdAt: true },
    }),
    prisma.roomTask.findMany({ where: { status: "DONE", assignedToId: { in: ids("HM") }, doneAt: { gte: since, lt: until } }, select: { assignedToId: true, roomId: true, doneAt: true } }),
    prisma.room.findMany({ select: { id: true, floor: true } }),
  ]);
  const floorOf = new Map(rooms.map((r) => [r.id, r.floor]));
  const acc = new Map<string, Map<string, Set<number>>>();
  const add = (uid: string | null, roomId: string | null, at: Date | null) => {
    if (!uid || !roomId || !at) return;
    const f = floorOf.get(roomId);
    if (f === undefined) return;
    const d = berlinDate(at);
    const byDay = acc.get(uid) ?? new Map<string, Set<number>>();
    byDay.set(d, (byDay.get(d) ?? new Set()).add(f));
    acc.set(uid, byDay);
  };
  for (const e of events) add(e.userId, e.roomId, e.createdAt);
  for (const t of tasks) add(t.assignedToId, t.roomId, t.doneAt);
  const out: Record<string, WorkDay[]> = {};
  for (const [uid, byDay] of acc) out[uid] = [...byDay.entries()].map(([d, fs]) => ({ date: d, floors: [...fs].sort((a, b) => a - b) }));
  return out;
}

export async function getFloorTeamState(date: string): Promise<FloorTeamState> {
  const settings = await getSettings();
  const team = await savedTeam(date);
  const users = await prisma.user.findMany({
    where: { role: { in: ["room_attendant", "supervisor", "houseman"] } }, orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, hkType: true, hkLevel: true, hkActive: true, assignedFloors: true, floorsOn: true },
  });
  const roleOf = (r: string): TeamRole => (r === "supervisor" ? "SUP" : r === "houseman" ? "HM" : "HK");
  const chosen = (u: (typeof users)[number]) => {
    const r = roleOf(u.role);
    if (!team) return r !== "HK" || u.hkActive;
    return (r === "SUP" ? team.sup : r === "HM" ? team.hm : team.hk).includes(u.id);
  };
  const present = users.filter(chosen);
  const badges = supervisorBadges(users.filter((u) => u.role === "supervisor"));
  const people: FloorPerson[] = present.map((u) => {
    const role = roleOf(u.role);
    if (role !== "HK") return { id: u.id, name: u.name, role, ...(role === "SUP" ? { badge: badges[u.id] } : {}) };
    const b = roomBand(u.hkType, u.hkLevel, settings as unknown as Record<string, number>);
    return { id: u.id, name: u.name, role, level: Math.min(3, Math.max(1, u.hkLevel)), kind: u.hkType, roomsLo: b.lo, roomsHi: b.hi };
  });

  const assign: FloorAssign = {};
  for (const u of present) {
    const role = roleOf(u.role);
    const floors = parseAssignedFloors(u.assignedFloors);
    if (role === "SUP" ? floors.length > 0 : u.floorsOn === date && floors.length > 0) assign[u.id] = floors;
  }

  const day = await loadDay(date);
  const loads: FloorLoad[] = PLAN_FLOORS.map((floor) => {
    const rs = day.rooms.filter((r) => r.floor === floor);
    return {
      floor, rooms: rs.length, credits: Math.round(rs.reduce((a, r) => a + r.credits, 0) * 10) / 10,
      departures: rs.filter((r) => r.kind !== "STAYOVER").length, stayovers: rs.filter((r) => r.kind === "STAYOVER").length,
      demanding: rs.filter((r) => r.demanding.length > 0).length,
    };
  });

  const rules = { window: settings.floorSuggestWindow, minDays: settings.floorSuggestMinDays, demandingShare: settings.floorDemandingWarnShare, maxFloors: settings.autoplanMaxFloors };
  const persons: Person[] = people.map((p) => ({ id: p.id, role: p.role, roomsLo: p.roomsLo ?? 0, roomsHi: p.roomsHi ?? 0, level: p.level ?? 0 }));
  const history = await loadHistory(persons, date);
  // H3: gelernte Etagen („Frau X wird immer von Etage 3 auf 2 getauscht") fließen als Vorschlag mit Grund ein
  const learned: Record<string, FloorReason[]> = {};
  for (const pt of await activePatterns(date)) {
    if (pt.kind !== "FLOOR" || !pt.personId || !pt.floor) continue;
    if (!persons.some((x) => x.id === pt.personId)) continue;
    (learned[pt.personId] ??= []).push({ floor: pt.floor, days: pt.days, of: pt.of, lastSeen: pt.lastDate, learned: true });
  }
  const suggestions = resolveSuggestions(persons, history, loads, assign, { window: rules.window, minDays: rules.minDays, maxFloors: 2 }, learned);
  return { date, people, loads, assign, suggestions, rules };
}

/**
 * Etagenzuweisung speichern. Jede Etage braucht einen gewählten Supervisor (wie bisher); alles andere sind
 * Warnungen. Je geänderter Person ein AuditLog-Eintrag (vorher/nachher, ohne Namen, ohne Stufe/Typ).
 */
export async function saveFloorTeam(date: string, assign: FloorAssign, actorId: string) {
  const team = await savedTeam(date);
  if (!team) throw new Error("Bitte zuerst das Team speichern.");
  const proposed = (await getFloorTeamState(date)).suggestions; // Systemvorschlag vor dem Speichern (für das Lernen)
  const allowed = new Set([...team.hk, ...team.sup, ...team.hm]);
  for (const [id, floors] of Object.entries(assign)) {
    if (!allowed.has(id)) throw new Error("Nur heute anwesende Personen können Etagen bekommen.");
    if (floors.some((f) => !(PLAN_FLOORS as readonly number[]).includes(f))) throw new Error("Unbekannte Etage.");
  }
  for (const f of PLAN_FLOORS) {
    if (!team.sup.some((id) => (assign[id] ?? []).includes(f))) throw new Error(`Etage ${f} hat noch keinen Supervisor.`);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...allowed] } }, select: { id: true, name: true, role: true, assignedFloors: true, floorsOn: true },
  });
  const before: FloorAssign = {};
  for (const u of users) {
    const f = parseAssignedFloors(u.assignedFloors);
    if (u.role === "supervisor" ? f.length : u.floorsOn === date && f.length) before[u.id] = f;
  }
  const after: FloorAssign = Object.fromEntries(Object.entries(assign).filter(([, v]) => v.length).map(([k, v]) => [k, [...new Set(v)].sort((a, b) => a - b)]));
  // Gewählte Supervisoren ohne Etage verlieren ihre Etagen (wie bisher in saveFloors)
  const changes = floorDiff(before, after);
  const byId = new Map(users.map((u) => [u.id, u]));
  for (const c of changes) {
    const u = byId.get(c.userId)!;
    if (u.role === "supervisor") {
      await assignFloors({ user: { id: u.id, name: u.name }, floors: c.after, actorId });
    } else {
      await prisma.user.update({ where: { id: u.id }, data: { assignedFloors: serializeAssignedFloors(c.after), floorsOn: date } });
      broadcast("user:floors", { userId: u.id, floors: c.after });
    }
    await audit({ action: "FLOOR_TEAM_ASSIGNED", userId: actorId, meta: { date, personId: u.id, role: u.role, before: c.before, after: c.after } });
  }
  // Nicht gewählte Supervisoren verlieren ihre Etagen (Regel aus D2)
  const others = await prisma.user.findMany({ where: { role: "supervisor", id: { notIn: team.sup } }, select: { id: true, name: true, assignedFloors: true } });
  for (const s of others) {
    const prev = parseAssignedFloors(s.assignedFloors);
    if (!prev.length) continue;
    await assignFloors({ user: { id: s.id, name: s.name }, floors: [], actorId });
    await audit({ action: "FLOOR_TEAM_ASSIGNED", userId: actorId, meta: { date, personId: s.id, role: "supervisor", before: prev, after: [] } });
  }
  // H3: Abweichung Vorschlag → Entscheidung festhalten (ohne Namen)
  await recordFloorDeviations(date, proposed, after, team.hk.length).catch(() => 0);
  broadcast("planning:floors", { date });
  return { changed: changes.length };
}
