import { compile, cost, eligible, type Compiled } from "./cost";
import { buildResult, fromIndexAssignment } from "./result";
import { MAX_PASSES, PERTURB_ROUNDS, TIME_LIMIT_MS } from "./weights";
import type { Assignment, PlanInput, PlanResult } from "./types";

export interface SolveOptions {
  timeLimitMs?: number;
  now?: () => number;
}

/** Feste Zimmer (manuell/heute zugeteilt) bleiben; Zimmer fest an jemanden, der nicht anwesend ist, werden ignoriert. */
export function splitFixed(input: PlanInput) {
  const present = new Set(input.housekeepers.map((h) => h.id));
  const fixed = input.rooms.filter((r) => r.fixedTo && present.has(r.fixedTo));
  const external = input.rooms.filter((r) => r.fixedTo && !present.has(r.fixedTo));
  return { fixed, external };
}

/**
 * Lokale Suche über die freien Zimmer (`free` = Indizes): einzelnes Zimmer verschieben, dann Zimmer tauschen,
 * bis die Kosten nicht mehr sinken. Deterministisch (feste Reihenfolge, Durchlauf-Grenze); das Zeitlimit
 * ist nur eine Notbremse.
 */
export function optimize(c: Compiled, assign: Int16Array, free: number[], opts: SolveOptions = {}): { timedOut: boolean } {
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.timeLimitMs ?? TIME_LIMIT_MS);
  const H = c.input.housekeepers.length;
  let current = cost(c, assign).total;
  let timedOut = false;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (const i of free) {
      const from = assign[i];
      let best = from, bestCost = current;
      for (let h = 0; h < H; h++) {
        if (h === from || !eligible(c, i, h)) continue;
        assign[i] = h;
        const t = cost(c, assign).total;
        if (t < bestCost - 1e-9) { bestCost = t; best = h; }
      }
      assign[i] = best;
      if (best !== from) { current = bestCost; improved = true; }
    }
    for (let a = 0; a < free.length; a++) {
      if (now() > deadline) { timedOut = true; return { timedOut }; }
      for (let b = a + 1; b < free.length; b++) {
        const i = free[a], j = free[b];
        const hi = assign[i], hj = assign[j];
        if (hi === hj || hi < 0 || hj < 0 || !eligible(c, i, hj) || !eligible(c, j, hi)) continue;
        assign[i] = hj; assign[j] = hi;
        const t = cost(c, assign).total;
        if (t < current - 1e-9) { current = t; improved = true; } else { assign[i] = hi; assign[j] = hj; }
      }
    }
    if (!improved) break;
  }
  return { timedOut };
}

/** Greedy-Start: anspruchsvolle Zimmer zuerst, dann nach Etage/Flügel; jedes Zimmer zum günstigsten geeigneten Housekeeper. */
export function greedyPlace(c: Compiled, assign: Int16Array, rooms: number[]) {
  const H = c.input.housekeepers.length;
  const sorted = [...rooms].sort((a, b) => {
    const ra = c.rooms[a], rb = c.rooms[b];
    return (rb.demanding.length > 0 ? 1 : 0) - (ra.demanding.length > 0 ? 1 : 0) ||
      ra.floor - rb.floor || ra.section.localeCompare(rb.section) || c.num[a] - c.num[b] || a - b;
  });
  for (const i of sorted) {
    let best = -1, bestCost = Infinity;
    for (let h = 0; h < H; h++) {
      if (!eligible(c, i, h)) continue;
      assign[i] = h;
      const t = cost(c, assign).total;
      if (t < bestCost - 1e-9) { bestCost = t; best = h; }
    }
    assign[i] = best; // -1 = niemand geeignet → bleibt offen
  }
}

/**
 * Zweite Startlösung "Sweep": freie Zimmer nach Etage/Nummer in zusammenhängende Blöcke schneiden, je Housekeeper
 * so groß wie sein Tagesziel (Stammetagen zuerst). Liefert von Anfang an wenige Etagen je Person; Zimmer, die der
 * Block einer Kraft der Stufe 1 zugeteilt hat und die anspruchsvoll sind, werden danach neu verteilt.
 */
export function sweepPlace(c: Compiled, assign: Int16Array, rooms: number[]) {
  const hks = c.input.housekeepers;
  const H = hks.length;
  if (H === 0) return;
  const sorted = [...rooms].sort((a, b) => c.rooms[a].floor - c.rooms[b].floor || c.num[a] - c.num[b] || a - b);
  const order = hks.map((_, k) => k).sort((a, b) =>
    Math.min(...(hks[a].homeFloors.length ? hks[a].homeFloors : [99])) - Math.min(...(hks[b].homeFloors.length ? hks[b].homeFloors : [99])) || a - b);
  // Zielgröße je Kraft: Anteil am Gesamt-Credit-Volumen ∝ Zielmitte (bereits vergebene feste Credits angerechnet)
  const total = sorted.reduce((a, i) => a + c.rooms[i].credits, 0);
  const share = (k: number) => (total * c.centers[k]) / c.centerSum;
  let pos = 0, acc = 0;
  for (const i of sorted) {
    while (pos < order.length - 1 && acc >= share(order[pos]) - 1e-9) { pos++; acc = 0; }
    assign[i] = order[pos];
    acc += c.rooms[i].credits;
  }
  const bad = sorted.filter((i) => !eligible(c, i, assign[i]));
  for (const i of bad) assign[i] = -1;
  greedyPlace(c, assign, bad);
}

/**
 * Zuteilungsvorschlag für alle freien Zimmer. Regeln und Gewichte: docs/autoplan.md.
 * Gleiche Eingabe → gleicher Vorschlag.
 */
export function proposePlan(input: PlanInput, opts: SolveOptions = {}): PlanResult {
  const { fixed, external } = splitFixed(input);
  const ext = new Set(external.map((r) => r.id));
  const rooms = input.rooms.filter((r) => !ext.has(r.id));
  const sub: PlanInput = { ...input, rooms };
  const c = compile(sub);
  const assign = new Int16Array(rooms.length).fill(-1);
  const free: number[] = [];
  rooms.forEach((r, i) => {
    if (r.fixedTo) assign[i] = c.hkIdx.get(r.fixedTo)!;
    else free.push(i);
  });
  void fixed;
  // Zwei Startlösungen (Greedy, Sweep), jeweils verbessert; die günstigere gewinnt (Gleichstand: Greedy).
  const a1 = assign.slice(), a2 = assign.slice();
  greedyPlace(c, a1, free);
  const r1 = optimize(c, a1, free, opts);
  sweepPlace(c, a2, free);
  const r2 = optimize(c, a2, free, opts);
  let best = cost(c, a2).total < cost(c, a1).total - 1e-9 ? a2 : a1;
  let timedOut = r1.timedOut || r2.timedOut;
  // Iterierte lokale Suche: leicht stören (festes Zufallsmuster → deterministisch), neu verbessern, Besseres behalten.
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.timeLimitMs ?? TIME_LIMIT_MS);
  let bestCost = cost(c, best).total;
  let seed = 12345;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const H = input.housekeepers.length;
  for (let round = 0; round < PERTURB_ROUNDS && free.length > 1 && H > 1; round++) {
    if (now() > deadline) { timedOut = true; break; }
    const t = best.slice();
    for (let k = 0; k < Math.max(3, Math.round(free.length / 12)); k++) {
      const i = free[rnd(free.length)], h = rnd(H);
      if (eligible(c, i, h)) t[i] = h;
    }
    optimize(c, t, free, { ...opts, timeLimitMs: Math.max(50, deadline - now()) });
    const tc = cost(c, t).total;
    if (tc < bestCost - 1e-9) { best = t; bestCost = tc; }
  }
  return buildResult(sub, fromIndexAssignment(c, best), timedOut);
}
