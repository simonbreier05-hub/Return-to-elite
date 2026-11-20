import { compile, cost, countsOf, eligible, type Compiled } from "./cost";
import { buildResult, fromIndexAssignment } from "./result";
import { MAX_PASSES, PERTURB_ROUNDS, TIME_LIMIT_MS } from "./weights";
import type { Assignment, PlanInput, PlanResult } from "./types";

export interface SolveOptions {
  timeLimitMs?: number;
  now?: () => number;
}

/** Feste Zimmer (manuell/heute zugeteilt) bleiben; begonnene Zimmer einer nicht eingeplanten Kraft bleiben bei ihr (werden hier ignoriert). Nicht begonnene werden schon beim Laden freigegeben (`morningInput`). */
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
  // F9 (N1): harte Obergrenze — ein Zimmer wechselt nur zu einer Kraft mit freiem Platz; Tausch hält die Zahlen gleich.
  const count = countsOf(c, assign);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (const i of free) {
      const from = assign[i];
      let best = from, bestCost = current;
      for (let h = 0; h < H; h++) {
        if (h === from || !eligible(c, i, h) || count[h] >= c.cap[h]) continue;
        assign[i] = h;
        const t = cost(c, assign).total;
        if (t < bestCost - 1e-9) { bestCost = t; best = h; }
      }
      assign[i] = best;
      if (best !== from) { current = bestCost; improved = true; if (from >= 0) count[from]--; count[best]++; }
    }
    for (let a = 0; a < free.length; a++) {
      if (now() > deadline) { timedOut = true; return { timedOut }; }
      for (let b = a + 1; b < free.length; b++) {
        const i = free[a], j = free[b];
        const hi = assign[i], hj = assign[j];
        // F9 (N1): auch Tausch mit dem Float (-1) — so entscheidet die Kostenfunktion, welche Zimmer im Float bleiben
        if (hi === hj || (hj >= 0 && !eligible(c, i, hj)) || (hi >= 0 && !eligible(c, j, hi))) continue;
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
  const count = countsOf(c, assign);
  const sorted = [...rooms].sort((a, b) => {
    const ra = c.rooms[a], rb = c.rooms[b];
    return (rb.demanding.length > 0 ? 1 : 0) - (ra.demanding.length > 0 ? 1 : 0) ||
      ra.floor - rb.floor || ra.section.localeCompare(rb.section) || c.num[a] - c.num[b] || a - b;
  });
  for (const i of sorted) {
    let best = -1, bestCost = Infinity;
    for (let h = 0; h < H; h++) {
      if (!eligible(c, i, h) || count[h] >= c.cap[h]) continue; // F9 (N1): Obergrenze zuerst
      assign[i] = h;
      const t = cost(c, assign).total;
      if (t < bestCost - 1e-9) { bestCost = t; best = h; }
    }
    assign[i] = best; // -1 = niemand geeignet oder alle an der Obergrenze → Float
    if (best >= 0) count[best]++;
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
  // Zielgröße je Kraft (Plan-1b): Anteil an der Zimmerzahl ∝ Mitte ihres Zimmer-Bands (ohne Band: Credit-Mitte)
  const total = sorted.length;
  const share = (k: number) => (total * c.roomCenters[k]) / c.roomCenterSum;
  const count = countsOf(c, assign);
  const got = new Float64Array(H);
  // F9 (N3): zuerst bekommt jede Kraft mit Präferenz-Etagen Zimmer dort (bis zu ihrem Anteil)
  for (const k of order) {
    if (!c.pref[k].size) continue;
    for (const i of sorted) {
      if (got[k] >= share(k) - 1e-9 || count[k] >= c.cap[k]) break;
      if (assign[i] >= 0 || !c.pref[k].has(c.rooms[i].floor) || !eligible(c, i, k)) continue;
      assign[i] = k; count[k]++; got[k] += 1;
    }
  }
  // Rest in zusammenhängenden Blöcken nach Etage/Nummer
  let pos = 0;
  for (const i of sorted) {
    if (assign[i] >= 0) continue;
    while (pos < order.length - 1 && (got[order[pos]] >= share(order[pos]) - 1e-9 || count[order[pos]] >= c.cap[order[pos]])) pos++;
    const k = order[pos];
    if (count[k] >= c.cap[k]) continue; // F9 (N1): alle voll → später Greedy/Float
    assign[i] = k;
    count[k]++;
    got[k] += 1;
  }
  const bad = sorted.filter((i) => assign[i] < 0 || !eligible(c, i, assign[i]));
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
  // F9: EIN Zeitbudget für den ganzen Vorschlag (vorher je Schritt 2 s → bis zu 6 s): Greedy-Start bis 40 %, Sweep-Start
  // bis 80 %, der Rest für die Störungsrunden. Das Budget ist nur die Notbremse; normal endet die Suche früher.
  const now = opts.now ?? Date.now;
  const budget = opts.timeLimitMs ?? TIME_LIMIT_MS;
  const start = now();
  const until = (share: number) => Math.max(50, start + budget * share - now());
  // Zwei Startlösungen (Greedy, Sweep), jeweils verbessert; die günstigere gewinnt (Gleichstand: Greedy).
  const a1 = assign.slice(), a2 = assign.slice();
  greedyPlace(c, a1, free);
  const r1 = optimize(c, a1, free, { ...opts, timeLimitMs: until(0.4) });
  sweepPlace(c, a2, free);
  const r2 = optimize(c, a2, free, { ...opts, timeLimitMs: until(0.8) });
  let best = cost(c, a2).total < cost(c, a1).total - 1e-9 ? a2 : a1;
  let timedOut = r1.timedOut || r2.timedOut;
  // Iterierte lokale Suche: leicht stören (festes Zufallsmuster → deterministisch), neu verbessern, Besseres behalten.
  const deadline = start + budget;
  let bestCost = cost(c, best).total;
  let seed = 12345;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const H = input.housekeepers.length;
  for (let round = 0; round < PERTURB_ROUNDS && free.length > 1 && H > 1; round++) {
    if (now() > deadline) { timedOut = true; break; }
    const t = best.slice();
    const cnt = countsOf(c, t);
    for (let k = 0; k < Math.max(3, Math.round(free.length / 12)); k++) {
      const i = free[rnd(free.length)], h = rnd(H);
      if (eligible(c, i, h) && t[i] !== h && cnt[h] < c.cap[h]) { if (t[i] >= 0) cnt[t[i]]--; t[i] = h; cnt[h]++; }
    }
    optimize(c, t, free, { ...opts, timeLimitMs: Math.max(50, deadline - now()) });
    const tc = cost(c, t).total;
    if (tc < bestCost - 1e-9) { best = t; bestCost = tc; }
  }
  enforceCap(c, best, free);
  return buildResult(sub, fromIndexAssignment(c, best), timedOut);
}

/**
 * F9 (N1): Sicherheitsnetz — liegt eine Kraft trotzdem über ihrer Obergrenze (z. B. durch eine Altlast), kommen freie
 * Zimmer in den Float: zuerst die, deren Entfernen am wenigsten kostet. Feste (Hand-)Zuteilungen bleiben immer.
 */
export function enforceCap(c: Compiled, assign: Int16Array, free: number[]) {
  const count = countsOf(c, assign);
  const freeSet = new Set(free);
  for (let h = 0; h < c.input.housekeepers.length; h++) {
    while (count[h] > c.cap[h]) {
      let pick = -1, pickCost = Infinity;
      for (let i = 0; i < assign.length; i++) {
        if (assign[i] !== h || !freeSet.has(i)) continue;
        assign[i] = -1;
        const t = cost(c, assign).total;
        assign[i] = h;
        if (t < pickCost - 1e-9) { pickCost = t; pick = i; }
      }
      if (pick < 0) break; // nur feste Zimmer übrig — bleiben (Warnung in buildResult)
      assign[pick] = -1;
      count[h]--;
    }
  }
}
