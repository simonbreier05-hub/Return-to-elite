import { compile, cost, eligible, type Compiled } from "./cost";
import { greedyPlace, optimize, type SolveOptions } from "./propose";
import { speedOf } from "./speed";
import type { Assignment, PlanHousekeeper, PlanInput, PlanRoom } from "./types";

/**
 * Live-Umverteilung tagsüber. Reine Funktion: aus dem aktuellen Stand konkrete Verschiebungen vorschlagen.
 * Nur NICHT begonnene Zimmer (state TODO) werden bewegt, immer unter denselben harten Regeln und Gewichten
 * wie der Morgenvorschlag, mit möglichst wenigen Verschiebungen. Der Supervisor entscheidet.
 */
export interface Move { roomId: string; fromId: string | null; toId: string }
export type SuggestionKind = "ABSENT" | "EARLY_FINISH" | "UNASSIGNED";
export interface Suggestion {
  kind: SuggestionKind;
  moves: Move[];
  /** Für den Begründungstext (IDs, keine Namen). */
  params: Record<string, string | number>;
  /** Zimmer, die nicht verschoben werden konnten (begonnen / niemand geeignet). */
  notMoved: { roomId: string; reason: "STARTED" | "NO_ELIGIBLE" }[];
}

export interface LiveInput {
  /** Alle heutigen Arbeits-Zimmer (jeder Status); `state` zeigt, was begonnen ist. */
  rooms: PlanRoom[];
  /** Anwesende Housekeeper (ohne Abwesende). */
  present: PlanHousekeeper[];
  /** Abwesende Housekeeper (nur ihre Zimmer sind für ABSENT relevant). */
  absent: PlanHousekeeper[];
  /** Aktuelle Zuteilung aller Zimmer. */
  current: Assignment;
  weights: PlanInput["weights"];
  maxFloors: number;
  fullTimeTarget: number;
  speeds: Record<string, number>;
  minutesPerCredit: number;
  earlyFinishMinutes: number;
  maxMoves: number;
}

const toPlanInput = (l: LiveInput, rooms: PlanRoom[]): PlanInput => ({
  rooms, housekeepers: l.present, weights: l.weights, maxFloors: l.maxFloors, fullTimeTarget: l.fullTimeTarget,
});

function indexAssign(c: Compiled, current: Assignment): Int16Array {
  const a = new Int16Array(c.rooms.length).fill(-1);
  c.rooms.forEach((r, i) => { const h = current[r.id] ? c.hkIdx.get(current[r.id]!) : undefined; a[i] = h === undefined ? -1 : h; });
  return a;
}

export function remainingMinutes(l: LiveInput): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(l.present.map((h) => [h.id, 0]));
  for (const r of l.rooms) {
    const hk = l.current[r.id];
    if (hk && hk in out && r.state !== "DONE") out[hk] += r.credits * speedOf(l.speeds, hk, l.minutesPerCredit);
  }
  return out;
}

/** Ausfall: alle nicht begonnenen Zimmer der abwesenden Kraft auf die Anwesenden verteilen. */
function suggestAbsent(l: LiveInput): Suggestion[] {
  const absentIds = new Set(l.absent.map((h) => h.id));
  const out: Suggestion[] = [];
  for (const ab of l.absent) {
    const mine = l.rooms.filter((r) => l.current[r.id] === ab.id);
    const movable = mine.filter((r) => r.state === "TODO");
    const started = mine.filter((r) => r.state === "STARTED");
    if (!movable.length) continue;
    // Problem = Zimmer der Anwesenden + die beweglichen Zimmer der Abwesenden (offen); fremde Abwesende bleiben außen vor.
    const rooms = l.rooms.filter((r) => { const h = l.current[r.id]; return !(h && absentIds.has(h)) || movable.some((m) => m.id === r.id); });
    const c = compile(toPlanInput(l, rooms));
    const assign = indexAssign(c, l.current);
    const free = movable.map((m) => c.roomIdx.get(m.id)!);
    for (const i of free) assign[i] = -1;
    greedyPlace(c, assign, free);
    optimize(c, assign, free, { timeLimitMs: 500 });
    const moves: Move[] = [], notMoved: Suggestion["notMoved"] = started.map((r) => ({ roomId: r.id, reason: "STARTED" as const }));
    for (const i of free) {
      const to = assign[i] >= 0 ? l.present[assign[i]].id : null;
      if (to) moves.push({ roomId: c.rooms[i].id, fromId: ab.id, toId: to });
      else notMoved.push({ roomId: c.rooms[i].id, reason: "NO_ELIGIBLE" });
    }
    if (moves.length || notMoved.length) out.push({ kind: "ABSENT", moves, notMoved, params: { from: ab.id } });
  }
  return out;
}

/** Offene Zimmer ohne Housekeeper (z. B. neuer Turn nach Nachimport) dem günstigsten zuteilen. */
function suggestUnassigned(l: LiveInput, taken: Set<string>): Suggestion[] {
  const open = l.rooms.filter((r) => r.state === "TODO" && !l.current[r.id] && !taken.has(r.id));
  if (!open.length) return [];
  const rooms = l.rooms.filter((r) => { const h = l.current[r.id]; return !h || l.present.some((p) => p.id === h) || open.some((o) => o.id === r.id); });
  const c = compile(toPlanInput(l, rooms));
  const assign = indexAssign(c, l.current);
  const free = open.map((m) => c.roomIdx.get(m.id)!);
  greedyPlace(c, assign, free);
  optimize(c, assign, free, { timeLimitMs: 500 });
  const moves: Move[] = [], notMoved: Suggestion["notMoved"] = [];
  for (const i of free) {
    if (assign[i] >= 0) moves.push({ roomId: c.rooms[i].id, fromId: null, toId: l.present[assign[i]].id });
    else notMoved.push({ roomId: c.rooms[i].id, reason: "NO_ELIGIBLE" });
  }
  return moves.length || notMoved.length ? [{ kind: "UNASSIGNED", moves, notMoved, params: { count: open.length } }] : [];
}

const TIME_WEIGHT = 5; // je (10 min)² Restzeit-Unterschied
const MIN_GAP_MIN = 20; // darunter lohnt keine Verschiebung

/** Früher fertig: wer bald fertig ist (oder deutlich unter dem Schnitt liegt), übernimmt Zimmer von der am stärksten belasteten Kraft. */
function suggestEarlyFinish(l: LiveInput, taken: Set<string>): Suggestion[] {
  if (l.present.length < 2) return [];
  const rem = remainingMinutes(l);
  const ids = l.present.map((h) => h.id);
  const avg = ids.reduce((a, id) => a + rem[id], 0) / ids.length;
  const out: Suggestion[] = [];
  const c = compile(toPlanInput(l, l.rooms.filter((r) => { const h = l.current[r.id]; return !h || ids.includes(h); })));
  const assign = indexAssign(c, l.current);
  const moved = new Set<string>();

  const early = ids.filter((id) => rem[id] <= l.earlyFinishMinutes || (rem[id] <= avg * 0.5 && avg - rem[id] >= 30)).sort((a, b) => rem[a] - rem[b]);
  for (const to of early) {
    const moves: Move[] = [];
    const toK = c.hkIdx.get(to)!;
    const toMinutes = Math.round(rem[to]);
    for (let n = 0; n < l.maxMoves; n++) {
      const donor = ids.filter((id) => id !== to).sort((a, b) => rem[b] - rem[a])[0];
      if (!donor || rem[donor] - rem[to] < MIN_GAP_MIN) break;
      const donorK = c.hkIdx.get(donor)!;
      const base = cost(c, assign, { rulesOnly: true }).total;
      let best = -1, bestScore = Infinity;
      c.rooms.forEach((r, i) => {
        if (assign[i] !== donorK || r.state !== "TODO" || taken.has(r.id) || moved.has(r.id) || !eligible(c, i, toK)) return;
        const mins = (id: string) => r.credits * speedOf(l.speeds, id, l.minutesPerCredit);
        const gapAfter = Math.abs(rem[donor] - mins(donor) - (rem[to] + mins(to)));
        if (gapAfter >= Math.abs(rem[donor] - rem[to])) return; // muss die Lücke verkleinern
        assign[i] = toK;
        const delta = cost(c, assign, { rulesOnly: true }).total - base;
        assign[i] = donorK;
        const score = delta + TIME_WEIGHT * (gapAfter / 10) ** 2;
        if (score < bestScore - 1e-9) { bestScore = score; best = i; }
      });
      if (best < 0) break;
      const r = c.rooms[best];
      rem[donor] -= r.credits * speedOf(l.speeds, donor, l.minutesPerCredit);
      rem[to] += r.credits * speedOf(l.speeds, to, l.minutesPerCredit);
      assign[best] = toK;
      moved.add(r.id);
      moves.push({ roomId: r.id, fromId: donor, toId: to });
    }
    if (moves.length) out.push({ kind: "EARLY_FINISH", moves, notMoved: [], params: { to, minutes: toMinutes, avgMinutes: Math.round(avg) } });
  }
  return out;
}

export function suggestRedistribution(l: LiveInput, _opts: SolveOptions = {}): Suggestion[] {
  const absent = suggestAbsent(l);
  const taken = new Set(absent.flatMap((s) => s.moves.map((m) => m.roomId)));
  const unassigned = suggestUnassigned(l, taken);
  unassigned.forEach((s) => s.moves.forEach((m) => taken.add(m.roomId)));
  return [...absent, ...unassigned, ...suggestEarlyFinish(l, taken)];
}

/** Stabile Kennung der Verschiebungen: abgelehnte Vorschläge erscheinen nur wieder, wenn sich die Lage ändert. */
export function suggestionSignature(s: Pick<Suggestion, "kind" | "moves">): string {
  return `${s.kind}:` + [...s.moves].map((m) => `${m.roomId}>${m.toId}`).sort().join(",");
}
