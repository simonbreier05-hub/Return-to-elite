import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { berlinDate } from "@/lib/dayplan/time";
import { parseAssignedFloors } from "@/lib/floors";
import { assignFloors } from "@/lib/users/assignFloors";
import { bandFor, loadDay } from "@/lib/autoplan/load";
import { getPlanningCreditSettings, getSettings } from "@/lib/settings";
import { PLAN_FLOORS, pickDefaultTeam, type SavedTeam, type TeamSelection } from "./team";
import { supervisorBadges, type HouseSupervisor } from "./model";

/**
 * Daten für die Planungstool-Schritte „Team" und „Etagen". Typ/Stufe der Housekeeper sind Beschäftigtendaten:
 * dieses Modul wird nur hinter `requireRole(["supervisor"])` aufgerufen (siehe Allow-List in tests/autoplan/privacy.test.ts)
 * und schreibt sie nie in Logs oder Fehlermeldungen.
 */
const KEY = "planningTeam";

export interface TeamMember { id: string; name: string }
export interface HkMember extends TeamMember { kind: string; level: number; target: number }
export interface SupMember extends TeamMember { badge: HouseSupervisor }

export interface TeamState {
  date: string;
  hasPlan: boolean;
  demand: { credits: number; rooms: number };
  members: { hk: HkMember[]; sup: SupMember[]; hm: TeamMember[] };
  selected: TeamSelection;
  source: "today" | "previous" | "default";
  /** Etage → Supervisor-ID (nur Gewählte; sonst leer). */
  floorAssign: Record<number, string | null>;
}

async function readSaved(): Promise<SavedTeam | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as Partial<SavedTeam>;
    if (typeof v.date !== "string" || !Array.isArray(v.hk) || !Array.isArray(v.sup) || !Array.isArray(v.hm)) return null;
    return { date: v.date, hk: v.hk.map(String), sup: v.sup.map(String), hm: v.hm.map(String) };
  } catch { return null; }
}

export async function getTeamState(date: string): Promise<TeamState> {
  const [settings, planning] = await Promise.all([getSettings(), getPlanningCreditSettings()]);
  const [hks, sups, hms] = await Promise.all([
    prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "supervisor" }, orderBy: { name: "asc" }, select: { id: true, name: true, assignedFloors: true } }),
    prisma.user.findMany({ where: { role: "houseman" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const hk: HkMember[] = hks.map((u) => {
    const band = bandFor({ hkType: u.hkType, dailyTarget: u.dailyTarget }, settings, planning.targetCreditsPerAttendant);
    return { id: u.id, name: u.name, kind: u.hkType, level: Math.min(3, Math.max(1, u.hkLevel)), target: Math.round(((band.lo + band.hi) / 2) * 10) / 10 };
  });
  const badges = supervisorBadges(sups);
  const sel = pickDefaultTeam(date, await readSaved(), {
    hk: hk.map((h) => h.id), sup: sups.map((s) => s.id), hm: hms.map((h) => h.id),
    absentToday: hks.filter((u) => u.absentDate === date).map((u) => u.id),
  });

  const day = await loadDay(date);
  const floorAssign: Record<number, string | null> = {};
  for (const f of PLAN_FLOORS) floorAssign[f] = null;
  for (const s of sups) {
    if (!sel.selected.sup.includes(s.id)) continue;
    for (const f of parseAssignedFloors(s.assignedFloors)) floorAssign[f] = s.id;
  }
  return {
    date,
    hasPlan: day.rooms.length > 0,
    demand: { credits: Math.round(day.rooms.reduce((a, r) => a + r.credits, 0) * 10) / 10, rooms: day.rooms.length },
    members: { hk, sup: sups.map((s) => ({ id: s.id, name: s.name, badge: badges[s.id] })), hm: hms },
    selected: sel.selected,
    source: sel.source,
    floorAssign,
  };
}

/** „Heute anwesend" speichern: im Roster (Abwesenheitsdatum der Housekeeper) und als Auswahl für den nächsten Tag. */
export async function saveTeam(date: string, sel: TeamSelection, userId: string) {
  const [hks, sups, hms] = await Promise.all([
    prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, select: { id: true, absentDate: true } }),
    prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true } }),
    prisma.user.findMany({ where: { role: "houseman" }, select: { id: true } }),
  ]);
  const inRole = (ids: string[], pool: { id: string }[]) => ids.every((id) => pool.some((p) => p.id === id));
  if (!inRole(sel.hk, hks) || !inRole(sel.sup, sups) || !inRole(sel.hm, hms)) throw new Error("Unbekannte Person in der Auswahl.");

  const chosen = new Set(sel.hk);
  for (const u of hks) {
    if (chosen.has(u.id)) {
      if (u.absentDate === date) await prisma.user.update({ where: { id: u.id }, data: { absentDate: null } });
    } else if (u.absentDate !== date && (!u.absentDate || u.absentDate < date)) {
      await prisma.user.update({ where: { id: u.id }, data: { absentDate: date } });
    }
  }
  const value = JSON.stringify({ date, hk: sel.hk, sup: sel.sup, hm: sel.hm } satisfies SavedTeam);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  await audit({ action: "PLANNING_TEAM_SAVED", userId, meta: { date, hk: sel.hk.length, sup: sel.sup.length, hm: sel.hm.length } });
}

/** Etagenzuweisung in die bestehende Zuweisung (`User.assignedFloors`) schreiben. Jede Etage braucht einen gewählten Supervisor. */
export async function saveFloors(date: string, assign: Record<number, string>, userId: string) {
  const saved = await readSaved();
  if (!saved || saved.date !== date) throw new Error("Bitte zuerst das Team speichern.");
  for (const f of PLAN_FLOORS) {
    if (!assign[f]) throw new Error(`Etage ${f} hat noch keinen Supervisor.`);
    if (!saved.sup.includes(assign[f])) throw new Error("Nur gewählte Supervisoren können Etagen übernehmen.");
  }
  const sups = await prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true, name: true, assignedFloors: true } });
  for (const s of sups) {
    const next = PLAN_FLOORS.filter((f) => assign[f] === s.id) as number[];
    const prev = parseAssignedFloors(s.assignedFloors);
    if (next.join(",") !== prev.join(",")) await assignFloors({ user: { id: s.id, name: s.name }, floors: next, actorId: userId });
  }
}

export const todayBerlin = () => berlinDate(new Date());
