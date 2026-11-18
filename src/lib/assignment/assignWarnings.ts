import { prisma } from "@/lib/db";
import { getRoomTypeCredits, getSettings } from "@/lib/settings";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import type { RoomType } from "@/lib/domain";
import { berlinDate } from "@/lib/dayplan/time";
import { SUITE_TYPES, parseRestrictions } from "@/lib/autoplan/types";
import { roomBand } from "@/lib/planung/floorTeam";

/**
 * F4 Aufgabe 2 (H3, Entscheidung Frage 1 — P6 neu): Zuteilen von Hand bleibt erlaubt, zeigt aber vor dem Speichern Warnungen —
 * „Stufe 1 + anspruchsvolles Zimmer“, „gegen Einschränkung“, „mehr als N Suiten“, „über Tagesziel“, „heute krank/abwesend“.
 * Eine Regel für alle Zuteil-Wege (einzeln, Mehrfachauswahl, Verschieben). Nur Zimmernummern, keine Gastdaten.
 * Wer die Warnung sieht: nur Supervisor/Duty Manager (die Zuteil-Wege sind für Housekeeper gesperrt).
 */
export interface AssignWarning { code: "LEVEL1_DEMANDING" | "RESTRICTION" | "TOO_MANY_SUITES" | "OVER_TARGET" | "ABSENT_TODAY"; message: string; rooms: string[] }

export async function assignWarnings(hkId: string, roomIds: string[], now = new Date()): Promise<AssignWarning[]> {
  const date = berlinDate(now);
  const [u, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: hkId }, select: { name: true, role: true, hkLevel: true, hkType: true, hkRestrictions: true, dailyTarget: true, absentDate: true, sickDate: true } }),
    getSettings(),
  ]);
  if (!u || u.role !== "room_attendant" || !roomIds.length) return [];
  const typeCredits = await getRoomTypeCredits();
  const roomsRaw = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true, type: true, isAntiAllergic: true, credit: true }, orderBy: { number: "asc" } });
  // Dieselbe Suiten-Regel wie der Vorschlag (load.ts): Zimmertyp ODER Credit ab der Schwelle
  const rooms = roomsRaw.map((r) => ({ ...r, suite: (SUITE_TYPES as readonly string[]).includes(r.type) || (!!settings.suiteMinCredit && computeRoomCredit({ type: r.type as RoomType, credits: typeCredits, roomCredit: r.credit }) >= settings.suiteMinCredit) }));
  const [plans, traces, already] = await Promise.all([
    prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: roomIds } }, select: { roomId: true, vip: true } }),
    prisma.trace.groupBy({ by: ["roomId"], where: { status: "OPEN", roomId: { in: roomIds } }, _count: true }),
    prisma.room.findMany({ where: { assignedToId: hkId, assignedOn: date, id: { notIn: roomIds } }, select: { id: true, type: true, credit: true } }),
  ]);
  const vip = new Set(plans.filter((p) => p.vip).map((p) => p.roomId));
  const traceN = new Map(traces.map((t) => [t.roomId, t._count]));
  const isSuite = (r: { type: string; credit?: number | null }) => (SUITE_TYPES as readonly string[]).includes(r.type)
    || (!!settings.suiteMinCredit && computeRoomCredit({ type: r.type as RoomType, credits: typeCredits, roomCredit: r.credit ?? null }) >= settings.suiteMinCredit);
  const demanding = rooms.filter((r) => r.suite || vip.has(r.id) || r.isAntiAllergic || (traceN.get(r.id) ?? 0) >= settings.autoplanManyTraces);
  const restrictions = parseRestrictions(u.hkRestrictions);
  const out: AssignWarning[] = [];
  const add = (code: AssignWarning["code"], message: string, list: { number: string }[]) => { if (list.length) out.push({ code, message, rooms: list.map((r) => r.number) }); };

  if (u.sickDate === date || u.absentDate === date) add("ABSENT_TODAY", `${u.name} ist heute ${u.sickDate === date ? "krank gemeldet" : "abwesend"}.`, rooms);
  if (u.hkLevel < 2) add("LEVEL1_DEMANDING", `${u.name} ist Stufe 1 — anspruchsvolle Zimmer: ${demanding.map((r) => r.number).join(", ")}.`, demanding);
  const hit = rooms.filter((r) => (restrictions.includes("NO_SUITE") && r.suite) || (restrictions.includes("NO_VIP") && vip.has(r.id)) || (restrictions.includes("NO_ALLERGY") && r.isAntiAllergic));
  add("RESTRICTION", `${u.name} hat eine Einschränkung (${restrictions.join(", ")}) — betroffen: ${hit.map((r) => r.number).join(", ")}.`, hit);
  const suites = rooms.filter((r) => r.suite).length + already.filter((r) => isSuite(r)).length;
  if (suites > settings.maxSuitesPerHk) add("TOO_MANY_SUITES", `${u.name} hätte ${suites} Suiten — vorgesehen sind höchstens ${settings.maxSuitesPerHk}.`, rooms.filter((r) => r.suite));
  const band = roomBand(u.hkType, settings as unknown as Record<string, number>, u.dailyTarget);
  const total = already.length + rooms.length;
  if (band.hi > 0 && total > band.hi) add("OVER_TARGET", `${u.name} hätte ${total} Zimmer — Tagesziel ${band.lo === band.hi ? band.hi : `${band.lo}–${band.hi}`}.`, rooms);
  return out;
}
