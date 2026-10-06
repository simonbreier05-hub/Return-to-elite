import { CENTER_PULL, NUMBER_JUMP_GAP, UNASSIGNED_PENALTY } from "./weights";
import type { PlanInput, PlanRoom } from "./types";

/** Vorberechnete Struktur für schnelle Kostenberechnung (Zimmer/Housekeeper als Indizes). */
export interface Compiled {
  input: PlanInput;
  rooms: PlanRoom[];
  /** Zimmer-Indizes nach Etage, Nummer sortiert (für Sprünge). */
  order: number[];
  roomIdx: Map<string, number>;
  hkIdx: Map<string, number>;
  pairs: [number, number][];
  num: number[];
  centers: number[];
  centerSum: number;
  pref: Set<number>[];
}

export type CostPart = "extraFloor" | "credits" | "categoryFairness" | "demandingFairness" | "interconnectSplit" | "homeFloor" | "jump" | "unassigned";
export interface CostOptions {
  /** Nur die Regeln (Etagen, Interconnecting, Stammetage, Sprünge) — für Umverteilung nach Restzeit. */
  rulesOnly?: boolean;
}

export function compile(input: PlanInput): Compiled {
  const rooms = input.rooms;
  const roomIdx = new Map(rooms.map((r, i) => [r.id, i]));
  const hkIdx = new Map(input.housekeepers.map((h, i) => [h.id, i]));
  const num = rooms.map((r) => parseInt(r.number, 10) || 0);
  const order = rooms.map((_, i) => i).sort((a, b) => rooms[a].floor - rooms[b].floor || num[a] - num[b] || a - b);
  const pairs: [number, number][] = [];
  rooms.forEach((r, i) => r.interconnect.forEach((id) => {
    const j = roomIdx.get(id);
    if (j !== undefined && i < j) pairs.push([i, j]);
  }));
  const centers = input.housekeepers.map((h) => (h.lo + h.hi) / 2);
  return {
    input, rooms, order, roomIdx, hkIdx, pairs, num, centers, centerSum: centers.reduce((a, b) => a + b, 0) || 1,
    pref: input.housekeepers.map((h) => new Set([...h.homeFloors, ...h.yesterdayFloors])),
  };
}

const popcount = (m: number) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };

/** Eignung: Stufe 1 bekommt nie anspruchsvolle Zimmer. */
export function eligible(c: Compiled, roomI: number, hkI: number): boolean {
  return c.input.housekeepers[hkI].level >= 2 || c.rooms[roomI].demanding.length === 0;
}

/**
 * Kostenfunktion des Zuteilungsvorschlags (docs/autoplan.md). `assign[i]` ist der Housekeeper-Index
 * oder -1 (offen). Deterministisch, O(Zimmer).
 */
export function cost(c: Compiled, assign: Int16Array, opts: CostOptions = {}): { total: number; parts: Record<CostPart, number> } {
  const { weights: w, maxFloors, housekeepers: hks } = c.input;
  const H = hks.length;
  const credits = new Float64Array(H), dep = new Int32Array(H), stay = new Int32Array(H), linen = new Int32Array(H), dem = new Int32Array(H);
  const mask = new Int32Array(H), last = new Int32Array(H).fill(-1);
  let homeMis = 0, jumps = 0, unassigned = 0;

  for (const i of c.order) {
    const a = assign[i];
    if (a < 0) { unassigned++; continue; }
    const r = c.rooms[i];
    credits[a] += r.credits;
    if (r.kind === "STAYOVER") { if (r.laundry) linen[a]++; else stay[a]++; } else dep[a]++;
    if (r.demanding.length) dem[a]++;
    mask[a] |= 1 << r.floor;
    const pref = c.pref[a];
    if (pref.size && !pref.has(r.floor)) homeMis++;
    const l = last[a];
    if (l >= 0) {
      const p = c.rooms[l];
      if (p.floor !== r.floor || p.section !== r.section || c.num[i] - c.num[l] > NUMBER_JUMP_GAP) jumps++;
    }
    last[a] = i;
  }

  const parts: Record<CostPart, number> = { extraFloor: 0, credits: 0, categoryFairness: 0, demandingFairness: 0, interconnectSplit: 0, homeFloor: 0, jump: 0, unassigned: 0 };
  for (let h = 0; h < H; h++) {
    const extra = popcount(mask[h]) - maxFloors;
    if (extra > 0) parts.extraFloor += extra * w.extraFloor;
  }
  for (const [i, j] of c.pairs) if (assign[i] >= 0 && assign[j] >= 0 && assign[i] !== assign[j]) parts.interconnectSplit += w.interconnectSplit;
  parts.homeFloor = homeMis * w.homeFloor;
  parts.jump = jumps * w.jump;
  parts.unassigned = unassigned * UNASSIGNED_PENALTY;

  if (!opts.rulesOnly) {
    for (let h = 0; h < H; h++) {
      const { lo, hi } = hks[h];
      const cr = credits[h];
      const dev = cr < lo ? lo - cr : cr > hi ? cr - hi : 0;
      parts.credits += w.credits * (dev * dev + CENTER_PULL * (cr - c.centers[h]) ** 2 * (dev > 0 ? 0 : 1));
    }
    for (const cnt of [dep, stay, linen]) {
      let total = 0;
      for (let h = 0; h < H; h++) total += cnt[h];
      for (let h = 0; h < H; h++) {
        const expected = (total * c.centers[h]) / c.centerSum;
        parts.categoryFairness += w.categoryFairness * (cnt[h] - expected) ** 2;
      }
    }
    // Anspruchsvolle Zimmer gleichmäßig unter Stufe 2 und 3
    let n23 = 0, totalDem = 0;
    for (let h = 0; h < H; h++) if (hks[h].level >= 2) { n23++; totalDem += dem[h]; }
    if (n23 > 0) {
      const expected = totalDem / n23;
      for (let h = 0; h < H; h++) if (hks[h].level >= 2) parts.demandingFairness += w.demandingFairness * (dem[h] - expected) ** 2;
    }
  }
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts };
}
