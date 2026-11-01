import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { Session } from "@/lib/auth";
import { assignDailyNumbers } from "@/lib/assignment/dailyNumbers";
import { moveRoomBetweenAttendants } from "@/lib/rooms/moveRoomBetweenAttendants";
import { isStartedStatus } from "@/lib/rooms/startedStatus";
import { notifyPlanConfirmed } from "@/lib/rooms/notifyPlan";
import { distributeHouseman } from "@/lib/planung/housemanAssign";
import { savedTeamFor } from "@/lib/planung/savedTeam";
import { berlinDate } from "@/lib/dayplan/time";
import { loadDay, loadLive, morningInput, type DayData } from "./load";
import { recordRoomDeviations } from "@/lib/learning/store";
import { proposePlan } from "./propose";
import { buildResult } from "./result";
import { suggestionSignature, suggestRedistribution, type Move, type Suggestion } from "./redistribute";
import type { Assignment, PlanInput, PlanResult } from "./types";
import { keyed } from "@/lib/i18n/notificationText";

export interface ProposalPayload { input: PlanInput; result: PlanResult; generatedAt: string }

/** "Plan vorschlagen": Entwurf berechnen und speichern. Nichts ist live, bevor bestätigt wird. */
export async function proposeForDate(date: string, userId: string, attendantIds?: string[]) {
  const t0 = Date.now();
  const d = await loadDay(date, { attendantIds });
  if (!d.rooms.length) throw new Error(`Für den ${date} gibt es keinen Tagesplan oder keine zu reinigenden Zimmer. Bitte zuerst den Tagesplan berechnen.`);
  const input = morningInput(d);
  if (!input.housekeepers.length) throw new Error("Keine anwesenden Housekeeper ausgewählt.");
  const result = proposePlan(input);
  for (const message of d.learnedNotes) result.warnings.push({ code: "LEARNED_SKIPPED", severity: "INFO", message });
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

/** Fehler beim Bestätigen mit Code, damit die Oberfläche nachfragen kann (offene Zimmer, begonnene Zimmer). */
export class PlanConfirmError extends Error {
  constructor(public code: "OPEN_ROOMS" | "STARTED_ROOMS" | "INVALID", message: string, public data: Record<string, unknown> = {}) { super(message); }
}

export interface ConfirmOptions {
  /** Der Supervisor hat ausdrücklich bestätigt, dass noch Zimmer offen sind. */
  acceptOpen?: boolean;
  /** Der Supervisor hat ausdrücklich bestätigt, dass begonnene/fertige Zimmer die Kraft wechseln (Fortschritt bleibt erhalten). */
  confirmStarted?: boolean;
  /** Hausmann-Aufgaben (Traces) → Hausmann (null = für alle); wird in derselben Transaktion gespeichert. */
  housemanAssignments?: { traceId: string; userId: string | null }[];
}

const isStarted = isStartedStatus;

/**
 * Bestätigen: schreibt die Zuteilung, Reihenfolge, Tagesnummern in einer Transaktion live. Der Bestätigungs-Datensatz
 * (Betriebstag, Zeitstempel, Nutzer, Abweichungen) bleibt am Entwurf. Es gibt keine Sperren: auch fest/heute zugeteilte Zimmer
 * dürfen geändert werden; begonnene oder fertige Zimmer nur mit `confirmStarted` (Status/Fortschritt bleiben unverändert).
 * Offene Zimmer verhindern die Bestätigung nicht, brauchen aber `acceptOpen`. Danach bekommen die Betroffenen eine Meldung.
 */
export async function confirmProposal(proposalId: string, final: Assignment, session: Session, opts: ConfirmOptions = {}) {
  const row = await prisma.autoPlanProposal.findUnique({ where: { id: proposalId } });
  if (!row) throw new PlanConfirmError("INVALID", "Vorschlag nicht gefunden.");
  if (row.status !== "DRAFT") throw new PlanConfirmError("INVALID", "Dieser Vorschlag ist nicht mehr offen.");
  const { input, result: proposed } = JSON.parse(row.payload) as ProposalPayload;
  const hkIds = new Set(input.housekeepers.map((h) => h.id));

  const finalClean: Assignment = {};
  for (const r of input.rooms) {
    const to = final[r.id] ?? null;
    if (to && !hkIds.has(to)) throw new PlanConfirmError("INVALID", "Unbekannter Housekeeper in der Zuteilung.");
    finalClean[r.id] = to;
  }
  const db = await prisma.room.findMany({ where: { id: { in: input.rooms.map((r) => r.id) } }, select: { id: true, number: true, status: true, assignedToId: true, assignedOn: true } });
  const dbById = new Map(db.map((r) => [r.id, r]));
  // Begonnene/fertige Zimmer, die die Kraft wechseln würden: nur nach ausdrücklicher Bestätigung.
  const startedMoves = db.filter((r) => isStarted(r.status) && r.assignedToId && finalClean[r.id] !== r.assignedToId);
  if (startedMoves.length && !opts.confirmStarted) {
    throw new PlanConfirmError("STARTED_ROOMS", `${startedMoves.length} Zimmer sind schon begonnen oder fertig und würden die Kraft wechseln.`, { rooms: startedMoves.map((r) => r.number) });
  }

  const result = buildResult(input, finalClean);
  if (result.unassigned.length && !opts.acceptOpen) {
    throw new PlanConfirmError("OPEN_ROOMS", `${result.unassigned.length} Zimmer sind noch offen.`, { open: result.unassigned.length });
  }
  // Vorher-Stand (nur Zuteilungen von heute oder begonnene) für die Meldungen
  const before = new Map<string, Set<string>>();
  for (const r of db) if (r.assignedToId && (r.assignedOn === row.date || isStarted(r.status))) (before.get(r.assignedToId) ?? before.set(r.assignedToId, new Set()).get(r.assignedToId)!).add(r.id);

  // Hausmann-Zuteilungen prüfen (nur Hausmann-Traces, nur Hausmänner)
  const hmAssign = opts.housemanAssignments ?? [];
  if (hmAssign.length) {
    const hms = new Set((await prisma.user.findMany({ where: { role: "houseman" }, select: { id: true } })).map((u) => u.id));
    const traces = new Map((await prisma.trace.findMany({ where: { id: { in: hmAssign.map((a) => a.traceId) }, dept: "HOUSEMAN" }, select: { id: true } })).map((t) => [t.id, true]));
    for (const a of hmAssign) if (!traces.has(a.traceId) || (a.userId && !hms.has(a.userId))) throw new PlanConfirmError("INVALID", "Ungültige Hausmann-Zuteilung.");
  }
  // Hausmann-Aufgaben: nur die gewählten Hausmänner; ein Hausmann bekommt alle, mehrere nach Etage (Handwahl bleibt)
  const team = await savedTeamFor(row.date);
  let hmFinal = hmAssign;
  if (team?.hm.length) {
    const traces = await prisma.trace.findMany({ where: { date: row.date, dept: "HOUSEMAN", status: "OPEN" }, include: { room: { select: { floor: true } } } });
    const manual = Object.fromEntries(hmAssign.map((a) => [a.traceId, a.userId]));
    const dist = distributeHouseman(traces.map((t) => ({ id: t.id, floor: t.room.floor, assignedToId: t.assignedToId })), team.hm, manual);
    const merged = new Map(hmAssign.filter((a) => a.userId && team.hm.includes(a.userId)).map((a) => [a.traceId, a.userId as string | null]));
    for (const t of traces) if (dist[t.id] && t.assignedToId !== dist[t.id]) merged.set(t.id, dist[t.id]);
    hmFinal = [...merged].map(([traceId, userId]) => ({ traceId, userId }));
  }
  const movedStarted = new Set(startedMoves.map((r) => r.id));
  const todo = new Set(db.filter((r) => !isStarted(r.status)).map((r) => r.id));
  const updates = [];
  for (const rt of result.routes) {
    const base = rt.roomIds.filter((id) => !todo.has(id) && !movedStarted.has(id)).length; // Begonnenes behält seinen Platz vorn
    rt.roomIds.filter((id) => todo.has(id) || movedStarted.has(id)).forEach((id, i) => {
      updates.push(prisma.room.update({ where: { id }, data: { assignedToId: rt.hkId, routeOrder: base + i, assignedOn: row.date, deferredSince: null } }));
    });
  }
  for (const id of result.unassigned) {
    if (todo.has(id)) updates.push(prisma.room.update({ where: { id }, data: { assignedToId: null, routeOrder: null, assignedOn: null } }));
  }
  const withRooms = result.routes.filter((r) => r.roomIds.length).map((r) => r.hkId);
  const users = await prisma.user.findMany({ where: { id: { in: withRooms } }, select: { id: true, name: true } });
  const numbers = assignDailyNumbers(users);

  const deviations = input.rooms.map((r) => ({ room: r.number, from: proposed.assignment[r.id] ?? null, to: finalClean[r.id] }))
    .filter((d) => d.from !== d.to);
  await prisma.$transaction([
    ...updates,
    ...numbers.map((n) => prisma.user.update({ where: { id: n.id }, data: { dailyNumber: n.dailyNumber } })),
    ...hmFinal.map((a) => prisma.trace.update({ where: { id: a.traceId }, data: { assignedToId: a.userId } })),
    prisma.autoPlanProposal.updateMany({ where: { date: row.date, status: "CONFIRMED" }, data: { status: "SUPERSEDED" } }),
    prisma.autoPlanProposal.update({ where: { id: row.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: session.userId, deviations: JSON.stringify(deviations.map((d) => ({ ...d, at: new Date().toISOString() }))) } }),
  ]);
  // H3: Abweichungen fürs Lernen (Zimmer verschoben/zurückgestellt), ohne Namen
  await recordRoomDeviations(row.date, deviations, input.housekeepers.length).catch(() => 0);
  await audit({ action: "AUTOPLAN_CONFIRMED", userId: session.userId, meta: { date: row.date, rooms: input.rooms.length, open: result.unassigned.length, changed: deviations.length, changedRooms: deviations.map((d) => d.room) } });
  for (const r of startedMoves) {
    await audit({ action: "ROOM_MOVED_STARTED", userId: session.userId, roomId: r.id, meta: { date: row.date, status: r.status, fromAttendantId: r.assignedToId, toAttendantId: finalClean[r.id] } });
  }
  // Meldungen an die Betroffenen (neu/geändert), Zusammenfassung an Supervisor/Duty Manager/Hausmann
  const attendants = input.housekeepers.map((h) => {
    const m = result.metrics.find((x) => x.hkId === h.id)!;
    const now = new Set(result.routes.find((x) => x.hkId === h.id)?.roomIds ?? []);
    const was = before.get(h.id) ?? new Set<string>();
    const changed = now.size !== was.size || [...now].some((id) => !was.has(id));
    return { id: h.id, rooms: m.rooms, credits: m.credits, changed };
  });
  const firstConfirm = !(await prisma.autoPlanProposal.findFirst({ where: { date: row.date, status: "SUPERSEDED", confirmedAt: { not: null } }, select: { id: true } }));
  await notifyPlanConfirmed({ planId: row.id, date: row.date, actorId: session.userId, attendants, totalRooms: input.rooms.length, openRooms: result.unassigned.length, first: firstConfirm, supervisors: team?.sup, houseman: team?.hm });
  broadcast("assignments:applied", { by: session.name, totalRooms: input.rooms.length, attendantIds: withRooms });
  if (hmFinal.length) broadcast("trace:update", { assigned: hmFinal.length }); // keine Gastdaten
  void dbById;
  return { assigned: input.rooms.length - result.unassigned.length, open: result.unassigned.length, changed: deviations.length, date: row.date };
}

// ── Live-Umverteilung ────────────────────────────────────────────────────

const hashSig = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Lage prüfen und neue Umverteilungsvorschläge ablegen (Ereignis oder 10-Minuten-Prüfung).
 * Abgelehnte Vorschläge erscheinen nicht erneut, solange die Verschiebungen dieselben sind;
 * offene, die nicht mehr zur Lage passen, werden ersetzt.
 */
export async function checkRedistribution(date: string): Promise<{ created: number }> {
  // Umverteilung gibt es erst für einen bestätigten Plan — und nur mit dessen Kräften (loadDay → teamIdsFor).
  if (!(await prisma.autoPlanProposal.findFirst({ where: { date, status: "CONFIRMED" }, select: { id: true } }))) {
    await prisma.redistributionSuggestion.updateMany({ where: { date, status: "OPEN" }, data: { status: "SUPERSEDED" } }); // Altlast vor der Bestätigung
    return { created: 0 };
  }
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
      data: { type: "REDISTRIBUTION", level: "warning", targetRole: "supervisor", message: `Neuer Umverteilungsvorschlag: ${s.moves.length} Zimmer.`, ...keyed("notify.redistribution", { n: s.moves.length }), dedupeKey: `REDIST:${row.id}` },
    });
    broadcast("notification:new", { notification: n });
    broadcast("redistribution:new", { id: row.id, kind: s.kind });
    await audit({ action: "REDISTRIBUTION_SUGGESTED", meta: { date, kind: s.kind, rooms: s.moves.length } });
    created++;
  }
  return { created };
}

export async function listSuggestions(date: string) {
  // Ohne bestätigten Plan gibt es keine Umverteilung (und keine Karten)
  if (!(await prisma.autoPlanProposal.findFirst({ where: { date, status: "CONFIRMED" }, select: { id: true } }))) return { attendants: [], suggestions: [] };
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
