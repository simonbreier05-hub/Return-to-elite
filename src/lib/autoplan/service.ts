import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { Session } from "@/lib/auth";
import { assignDailyNumbers } from "@/lib/assignment/dailyNumbers";
import { moveRoomBetweenAttendants } from "@/lib/rooms/moveRoomBetweenAttendants";
import { berlinDate } from "@/lib/dayplan/time";
import { loadDay, loadLive, morningInput, type DayData } from "./load";
import { proposePlan } from "./propose";
import { buildResult } from "./result";
import { suggestionSignature, suggestRedistribution, type Move, type Suggestion } from "./redistribute";
import type { Assignment, PlanInput, PlanResult } from "./types";

export interface ProposalPayload { input: PlanInput; result: PlanResult; generatedAt: string }

/** "Plan vorschlagen": Entwurf berechnen und speichern. Nichts ist live, bevor bestätigt wird. */
export async function proposeForDate(date: string, userId: string, attendantIds?: string[]) {
  const t0 = Date.now();
  const d = await loadDay(date, { attendantIds });
  if (!d.rooms.length) throw new Error(`Für den ${date} gibt es keinen Tagesplan oder keine zu reinigenden Zimmer. Bitte zuerst den Tagesplan berechnen.`);
  const input = morningInput(d);
  if (!input.housekeepers.length) throw new Error("Keine anwesenden Housekeeper ausgewählt.");
  const result = proposePlan(input);
  await prisma.autoPlanProposal.updateMany({ where: { date, status: "DRAFT" }, data: { status: "SUPERSEDED" } });
  const payload: ProposalPayload = { input, result, generatedAt: new Date().toISOString() };
  const row = await prisma.autoPlanProposal.create({ data: { date, createdById: userId, payload: JSON.stringify(payload) } });
  await audit({ action: "AUTOPLAN_PROPOSED", userId, meta: { date, rooms: input.rooms.length, housekeepers: input.housekeepers.length, unassigned: result.unassigned.length, warnings: result.warnings.length, ms: Date.now() - t0 } });
  return { proposalId: row.id, payload };
}

export async function latestProposal(date: string) {
  const row = await prisma.autoPlanProposal.findFirst({ where: { date, status: { in: ["DRAFT", "CONFIRMED"] } }, orderBy: { createdAt: "desc" } });
  return row ? { id: row.id, status: row.status, payload: JSON.parse(row.payload) as ProposalPayload } : null;
}

/** Bestätigen (zwei Taps in der Oberfläche): schreibt die Zuteilung, Reihenfolge, Tagesnummern; protokolliert die Abweichung vom Vorschlag. */
export async function confirmProposal(proposalId: string, final: Assignment, session: Session) {
  const row = await prisma.autoPlanProposal.findUnique({ where: { id: proposalId } });
  if (!row) throw new Error("Vorschlag nicht gefunden.");
  if (row.status !== "DRAFT") throw new Error("Dieser Vorschlag ist nicht mehr offen.");
  const { input, result: proposed } = JSON.parse(row.payload) as ProposalPayload;
  const hkIds = new Set(input.housekeepers.map((h) => h.id));
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));

  const finalClean: Assignment = {};
  for (const r of input.rooms) {
    const to = final[r.id] ?? null;
    if (to && !hkIds.has(to)) throw new Error("Unbekannter Housekeeper in der Zuteilung.");
    if (r.fixedTo && hkIds.has(r.fixedTo) && to !== r.fixedTo) throw new Error(`Zimmer ${r.number} ist fest zugeteilt und kann hier nicht geändert werden.`);
    finalClean[r.id] = to;
  }
  // Inzwischen begonnene Zimmer dürfen nicht mehr verschoben werden.
  const db = await prisma.room.findMany({ where: { id: { in: input.rooms.map((r) => r.id) } }, select: { id: true, number: true, status: true, assignedToId: true } });
  for (const r of db) {
    const started = r.status === "IN_PROGRESS" || r.status === "CLEAN" || r.status === "INSPECTED";
    if (started && r.assignedToId && finalClean[r.id] !== r.assignedToId) throw new Error(`Zimmer ${r.number} wurde inzwischen begonnen und bleibt bei der aktuellen Kraft.`);
  }

  const result = buildResult(input, finalClean);
  const todo = new Set(db.filter((r) => !(r.status === "IN_PROGRESS" || r.status === "CLEAN" || r.status === "INSPECTED")).map((r) => r.id));
  const updates = [];
  for (const rt of result.routes) {
    const base = rt.roomIds.filter((id) => !todo.has(id)).length; // Begonnenes behält seinen Platz vorn
    rt.roomIds.filter((id) => todo.has(id)).forEach((id, i) => {
      updates.push(prisma.room.update({ where: { id }, data: { assignedToId: rt.hkId, routeOrder: base + i, assignedOn: row.date, deferredSince: null } }));
    });
  }
  for (const id of result.unassigned) {
    if (todo.has(id)) updates.push(prisma.room.update({ where: { id }, data: { assignedToId: null, routeOrder: null, assignedOn: null } }));
  }
  const withRooms = result.routes.filter((r) => r.roomIds.length).map((r) => r.hkId);
  const users = await prisma.user.findMany({ where: { id: { in: withRooms } }, select: { id: true, name: true } });
  const numbers = assignDailyNumbers(users);

  const deviations = input.rooms.flatMap((r) => (r.fixedTo ? [] : [{ room: r.number, from: proposed.assignment[r.id] ?? null, to: finalClean[r.id] }]))
    .filter((d) => d.from !== d.to);
  await prisma.$transaction([
    ...updates,
    ...numbers.map((n) => prisma.user.update({ where: { id: n.id }, data: { dailyNumber: n.dailyNumber } })),
    prisma.autoPlanProposal.updateMany({ where: { date: row.date, status: "CONFIRMED" }, data: { status: "SUPERSEDED" } }),
    prisma.autoPlanProposal.update({ where: { id: row.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: session.userId, deviations: JSON.stringify(deviations.map((d) => ({ ...d, at: new Date().toISOString() }))) } }),
  ]);
  await audit({ action: "AUTOPLAN_CONFIRMED", userId: session.userId, meta: { date: row.date, rooms: input.rooms.length, changed: deviations.length, changedRooms: deviations.map((d) => d.room) } });
  broadcast("assignments:applied", { by: session.name, totalRooms: input.rooms.length, attendantIds: withRooms });
  void roomById;
  return { assigned: input.rooms.length - result.unassigned.length, open: result.unassigned.length, changed: deviations.length };
}

// ── Live-Umverteilung ────────────────────────────────────────────────────

const hashSig = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Lage prüfen und neue Umverteilungsvorschläge ablegen (Ereignis oder 10-Minuten-Prüfung).
 * Abgelehnte Vorschläge erscheinen nicht erneut, solange die Verschiebungen dieselben sind;
 * offene, die nicht mehr zur Lage passen, werden ersetzt.
 */
export async function checkRedistribution(date: string): Promise<{ created: number }> {
  const d: DayData = await loadDay(date);
  if (!d.rooms.length) return { created: 0 };
  const live = await loadLive(d);
  const found: (Suggestion & { sig: string })[] = suggestRedistribution(live)
    .filter((s) => s.moves.length > 0)
    .map((s) => ({ ...s, sig: hashSig(suggestionSignature(s)) }));
  const existing = await prisma.redistributionSuggestion.findMany({ where: { date, status: { in: ["OPEN", "REJECTED"] } } });
  const known = new Set(existing.map((e) => e.signature));
  const foundSigs = new Set(found.map((f) => f.sig));
  const stale = existing.filter((e) => e.status === "OPEN" && !foundSigs.has(e.signature));
  if (stale.length) await prisma.redistributionSuggestion.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: "SUPERSEDED" } });
  let created = 0;
  for (const s of found) {
    if (known.has(s.sig)) continue;
    const row = await prisma.redistributionSuggestion.create({
      data: { date, kind: s.kind, moves: JSON.stringify(s.moves), reason: JSON.stringify({ key: s.kind, params: s.params }), signature: s.sig },
    });
    const n = await prisma.notification.create({
      data: { type: "REDISTRIBUTION", level: "warning", targetRole: "supervisor", message: `Neuer Umverteilungsvorschlag: ${s.moves.length} Zimmer.`, dedupeKey: `REDIST:${row.id}` },
    });
    broadcast("notification:new", { notification: n });
    broadcast("redistribution:new", { id: row.id, kind: s.kind });
    await audit({ action: "REDISTRIBUTION_SUGGESTED", meta: { date, kind: s.kind, rooms: s.moves.length } });
    created++;
  }
  return { created };
}

export async function listSuggestions(date: string) {
  const rows = await prisma.redistributionSuggestion.findMany({ where: { date, status: "OPEN" }, orderBy: { createdAt: "asc" } });
  const roomIds = rows.flatMap((r) => (JSON.parse(r.moves) as Move[]).map((m) => m.roomId));
  const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true, floor: true } });
  const users = await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, select: { id: true, name: true } });
  const roomBy = new Map(rooms.map((r) => [r.id, r])), nameBy = new Map(users.map((u) => [u.id, u.name]));
  return {
    attendants: users,
    suggestions: rows.map((r) => {
      const reason = JSON.parse(r.reason) as { key: string; params: Record<string, string | number> };
      return {
        id: r.id, kind: r.kind, createdAt: r.createdAt,
        params: { ...reason.params, fromName: nameBy.get(String(reason.params.from)) ?? "", toName: nameBy.get(String(reason.params.to)) ?? "" },
        moves: (JSON.parse(r.moves) as Move[]).map((m) => ({
          ...m, roomNumber: roomBy.get(m.roomId)?.number ?? "?", floor: roomBy.get(m.roomId)?.floor ?? 0,
          fromName: m.fromId ? nameBy.get(m.fromId) ?? "" : "", toName: nameBy.get(m.toId) ?? "",
        })),
      };
    }),
  };
}

/** Bestätigen (optional mit geänderten Zielen), Ablehnen. Erst bei Bestätigung ändert sich etwas bei den Housekeepern. */
export async function decideSuggestion(id: string, action: "confirm" | "reject", session: Session, override?: { roomId: string; toId: string }[]) {
  const row = await prisma.redistributionSuggestion.findUnique({ where: { id } });
  if (!row || row.status !== "OPEN") throw new Error("Vorschlag ist nicht mehr offen.");
  if (action === "reject") {
    await prisma.redistributionSuggestion.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date(), decidedById: session.userId } });
    await audit({ action: "REDISTRIBUTION_REJECTED", userId: session.userId, meta: { date: row.date, kind: row.kind } });
    return { applied: 0, skipped: 0 };
  }
  const stored = JSON.parse(row.moves) as Move[];
  const toOf = new Map((override ?? []).map((o) => [o.roomId, o.toId]));
  const attendants = new Set((await prisma.user.findMany({ where: { role: "room_attendant", hkActive: true }, select: { id: true } })).map((u) => u.id));
  let applied = 0, skipped = 0;
  const rooms: string[] = [];
  for (const m of stored) {
    const toId = toOf.get(m.roomId) ?? m.toId;
    const room = await prisma.room.findUnique({ where: { id: m.roomId } });
    const started = !room || room.status === "IN_PROGRESS" || room.status === "CLEAN" || room.status === "INSPECTED";
    if (started || !attendants.has(toId) || room.assignedToId === toId) { skipped++; continue; } // begonnene Zimmer werden nie verschoben
    if (room.assignedToId && room.assignedOn === row.date) {
      const r = await moveRoomBetweenAttendants(session, room.id, toId);
      if (!r.ok) { skipped++; continue; }
    } else {
      const next = (await prisma.room.aggregate({ where: { assignedToId: toId }, _max: { routeOrder: true } }))._max.routeOrder ?? -1;
      const upd = await prisma.room.update({ where: { id: room.id }, data: { assignedToId: toId, assignedOn: row.date, routeOrder: next + 1 } });
      broadcast("room:update", { room: upd });
    }
    applied++; rooms.push(room.number);
  }
  await prisma.redistributionSuggestion.update({ where: { id }, data: { status: "CONFIRMED", decidedAt: new Date(), decidedById: session.userId } });
  await audit({ action: "REDISTRIBUTION_CONFIRMED", userId: session.userId, meta: { date: row.date, kind: row.kind, rooms, changed: !!override?.length, skipped } });
  broadcast("assignments:applied", { by: session.name, totalRooms: applied });
  await checkRedistribution(row.date);
  return { applied, skipped };
}

/** Ein Tap: Housekeeper heute abwesend (oder wieder da). Löst die Prüfung auf Umverteilung aus. */
export async function setAbsent(hkId: string, absent: boolean, userId: string, now = new Date()) {
  const date = berlinDate(now);
  const u = await prisma.user.findUnique({ where: { id: hkId } });
  if (!u || u.role !== "room_attendant") throw new Error("Housekeeper nicht gefunden.");
  await prisma.user.update({ where: { id: hkId }, data: { absentDate: absent ? date : null } });
  await audit({ action: "HK_ABSENCE_SET", userId, meta: { hkId, absent, date } });
  if (!absent) {
    const open = await prisma.redistributionSuggestion.findMany({ where: { date, status: "OPEN", kind: "ABSENT" } });
    const mine = open.filter((s) => (JSON.parse(s.reason) as { params: { from?: string } }).params.from === hkId);
    if (mine.length) await prisma.redistributionSuggestion.updateMany({ where: { id: { in: mine.map((s) => s.id) } }, data: { status: "SUPERSEDED" } });
  }
  broadcast("assignments:applied", { by: "absence", totalRooms: 0 });
  return checkRedistribution(date);
}
