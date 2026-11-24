import { CENTER_PULL, LEVEL1_DEMANDING_PENALTY, NUMBER_JUMP_GAP, UNASSIGNED_PENALTY } from "./weights";
import { isSuite, restrictionHit, type PlanHousekeeper, type PlanInput, type PlanRoom } from "./types";

/** H3: geschätzte Minuten eines Zimmers für eine Person (Suite vor Art; Bleiber mit Wäsche = LAUNDRY). */
export function roomMinutes(h: PlanHousekeeper, r: PlanRoom): number {
  const m = h.minutesByKind;
  if (!m) return 0;
  if (r.demanding.includes("SUITE")) return m.SUITE;
  return r.kind === "STAYOVER" ? (r.laundry ? m.LAUNDRY : m.STAYOVER) : m[r.kind];
}

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
  /** Plan-1b: Mitte des Zimmer-Bands je Kraft (Anteil an jeder Art); ohne Band die Credit-Mitte. */
  roomCenters: number[];
  roomCenterSum: number;
  pref: Set<number>[];
  /** F9 (N1): harte Obergrenze der Zimmeranzahl je Kraft (Infinity = keine). */
  cap: number[];
  /** F9 (N3): Etage ist die Präferenz-Etage mindestens einer Kraft — fremde Kräfte dort kosten (`homeFloor`). */
  ownedFloors: Set<number>;
  /** Heutige Etagen laut Etagenzuweisung (leer = keine). */
  today: Set<number>[];
  /** Planung L1 (vorberechnet, damit die Kostenfunktion schnell bleibt): 1 = Zimmer zählt als Suite. */
  suite: Uint8Array;
  /** Planung L1: [Zimmer × Kraft] 1 = Zimmer verletzt eine Einschränkung der Kraft; null = niemand hat Einschränkungen. */
  restricted: Uint8Array | null;
  /** Planung L1 (Regel 13): Index der Kraft vom selben Aufenthalt je Zimmer, -1 = keine. */
  stayHk: Int16Array;
  /** F4 (Simon 19.11.): 1 = anspruchsvolles Zimmer, für das die Stufen-Regel heute nicht gilt (passende Kräfte über ihrer Zimmervorgabe). */
  relaxed: Uint8Array;
}

/**
 * F4 (Entscheidung Simon 19.11.2026, Kapazität): Die Stufen-Regel hat Vorrang, solange die passenden Kräfte (ab Stufe 2) das
 * innerhalb ihrer Zimmervorgabe schaffen. Reicht das nicht, gehen die übrigen anspruchsvollen Zimmer nach der normalen
 * Zimmervorgabe an alle Kräfte (auch Stufe 1) — statt alles bei einer Person zu stapeln. Immer mit Warnung (`buildResult`).
 * Zimmervorgabe = Zimmer-Band oben (`roomsHi`), ohne Band die Credit-Obergrenze (`hi`). Die Kräfte behalten die
 * schwersten Zimmer (Suite vor VIP/Allergiker, mehr Merkmale, mehr Credits); freigegeben werden die leichteren.
 * „Keine Suiten“ bleibt eine harte Einschränkung der Person. Ist gar niemand ab Stufe 2 da, bleibt es bei „offen + Hinweis“.
 */
export function levelOverflow(input: PlanInput, suite: Uint8Array): Uint8Array {
  const rooms = input.rooms;
  const out = new Uint8Array(rooms.length);
  const hks = input.housekeepers;
  const matching = hks.filter((h) => h.level >= 2);
  const free = rooms.map((r, i) => i).filter((i) => !rooms[i].fixedTo && rooms[i].demanding.length > 0);
  // Entscheidung Simon 20.11.2026: Die Zimmeranzahl überwiegt die Regeln — auch ohne Kraft ab Stufe 2 wird nach Zimmervorgabe
  // verteilt (nicht mehr offen gelassen), und reicht für Suiten keine Kraft ohne „keine Suiten“, gilt auch diese Einschränkung
  // für den Überhang nicht (Wert 2). Immer mit Warnung (`buildResult`).
  const suiteOverflow = () => {
    const allByRooms = hks.every((h) => h.roomsHi !== undefined);
    const u2 = (r: PlanRoom) => (allByRooms ? 1 : r.credits);
    const fixed2 = new Map<string, number>();
    for (const r of rooms) if (r.fixedTo) fixed2.set(r.fixedTo, (fixed2.get(r.fixedTo) ?? 0) + u2(r));
    let capable = hks.filter((h) => !(h.restrictions ?? []).includes("NO_SUITE")).reduce((a, h) => a + Math.max(0, (allByRooms ? Math.min(h.roomsHi!, h.cap ?? Infinity) : h.hi) - (fixed2.get(h.id) ?? 0)), 0);
    const suites = rooms.map((_, i) => i).filter((i) => !rooms[i].fixedTo && suite[i]).sort((a, b) => rooms[b].demanding.length - rooms[a].demanding.length || rooms[b].credits - rooms[a].credits || a - b);
    for (const i of suites) { const u = u2(rooms[i]); if (capable - u >= -1e-9) capable -= u; else out[i] = 2; }
  };
  if (!matching.length) { for (const i of free) out[i] = 1; suiteOverflow(); return out; }
  const byRooms = matching.every((h) => h.roomsHi !== undefined);
  const unit = (r: PlanRoom) => (byRooms ? 1 : r.credits);
  const fixedUnits = new Map<string, number>();
  for (const r of rooms) if (r.fixedTo) fixedUnits.set(r.fixedTo, (fixedUnits.get(r.fixedTo) ?? 0) + unit(r));
  const cap = (h: PlanHousekeeper) => Math.max(0, (byRooms ? Math.min(h.roomsHi!, h.cap ?? Infinity) : h.hi) - (fixedUnits.get(h.id) ?? 0));
  const capAll = matching.reduce((a, h) => a + cap(h), 0);
  const capSuite = matching.filter((h) => !(h.restrictions ?? []).includes("NO_SUITE")).reduce((a, h) => a + cap(h), 0);
  free.sort((a, b) => suite[b] - suite[a] || rooms[b].demanding.length - rooms[a].demanding.length || rooms[b].credits - rooms[a].credits ||
    (parseInt(rooms[a].number, 10) || 0) - (parseInt(rooms[b].number, 10) || 0) || a - b);
  let used = 0, usedSuite = 0;
  for (const i of free) {
    const u = unit(rooms[i]);
    const fits = used + u <= capAll + 1e-9 && (!suite[i] || usedSuite + u <= capSuite + 1e-9);
    if (fits) { used += u; if (suite[i]) usedSuite += u; } else out[i] = 1;
  }
  suiteOverflow();
  return out;
}

export type CostPart = "extraFloor" | "credits" | "categoryFairness" | "demandingFairness" | "interconnectSplit" | "homeFloor" | "jump" | "unassigned" | "levelMismatch" | "rooms" | "assignedFloor" | "learned" | "overtime" | "traineeSuite" | "suiteCap" | "restriction" | "stayContinuity";
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
  const roomCenters = input.housekeepers.map((h, k) => (h.roomsLo !== undefined && h.roomsHi !== undefined ? (h.roomsLo + h.roomsHi) / 2 : centers[k]));
  const H = input.housekeepers.length;
  const suite = Uint8Array.from(rooms, (r) => (isSuite(r, input.suiteMinCredit) ? 1 : 0));
  const anyRestricted = input.housekeepers.some((h) => h.restrictions?.length);
  const restricted = anyRestricted ? new Uint8Array(rooms.length * H) : null;
  if (restricted) rooms.forEach((r, i) => input.housekeepers.forEach((h, k) => { if (restrictionHit(h, r, input.suiteMinCredit)) restricted[i * H + k] = 1; }));
  const stayHk = Int16Array.from(rooms, (r) => (r.stayHk !== undefined && hkIdx.has(r.stayHk) ? hkIdx.get(r.stayHk)! : -1));
  const relaxed = levelOverflow(input, suite);
  const pref = input.housekeepers.map((h) => (h.todayFloors?.length || h.type === "EXTERN" ? new Set<number>() : new Set(h.homeFloors.length ? h.homeFloors : h.yesterdayFloors)));
  return {
    suite, restricted, stayHk, relaxed, pref,
    cap: input.housekeepers.map((h) => (h.cap !== undefined ? h.cap : Infinity)),
    ownedFloors: new Set(input.housekeepers.flatMap((h) => (h.type === "EXTERN" ? [] : h.homeFloors))),
    input, rooms, order, roomIdx, hkIdx, pairs, num, centers, centerSum: centers.reduce((a, b) => a + b, 0) || 1,
    roomCenters, roomCenterSum: roomCenters.reduce((a, b) => a + b, 0) || 1,
    // Planung L1: Springer (EXTERN) haben keine Präferenz-Etagen — sie gehen dorthin, wo Bedarf ist.
    // F9 (N3): Präferenz = Präferenz-Etagen aus den Einstellungen; nur wer keine hat, nimmt die Etagen von gestern.
    today: input.housekeepers.map((h) => new Set(h.todayFloors ?? [])),
  };
}

const popcount = (m: number) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };

/**
 * F4 (H2, Entscheidung Frage 1 — P6 neu): harter Filter NUR für den Vorschlag. Stufe 1 bekommt nie ein anspruchsvolles Zimmer
 * (Suite inkl. Junior Suite, VIP, Allergiker, viele Traces); eine Kraft mit „keine Suiten“ bekommt keine Suite (Annahme, gleiche
 * Logik). Findet sich niemand Passendes, bleibt das Zimmer im Vorschlag offen (Hinweis oben). Von Hand zuteilen bleibt erlaubt
 * (mit Warnung, `src/lib/assignment/assignWarnings.ts`); fest zugeteilte Zimmer (`fixedTo`) prüft der Filter nicht.
 */
export function eligible(c: Compiled, roomI: number, hkI: number): boolean {
  const h = c.input.housekeepers[hkI];
  if (h.level < 2 && c.rooms[roomI].demanding.length > 0 && !c.relaxed[roomI]) return false; // F4: außer Überhang (levelOverflow)
  if (c.suite[roomI] && (h.restrictions ?? []).includes("NO_SUITE") && c.relaxed[roomI] !== 2) return false; // Simon 20.11.: Überhang
  return true;
}

/** F9 (N1): Zimmeranzahl je Kraft in einer Zuteilung. */
export function countsOf(c: Compiled, assign: Int16Array): Int32Array {
  const n = new Int32Array(c.input.housekeepers.length);
  for (let i = 0; i < assign.length; i++) if (assign[i] >= 0) n[assign[i]]++;
  return n;
}

/** Nur für Systemvorschläge zur Umverteilung: anspruchsvolle Zimmer nicht von sich aus auf Stufe 1 schieben. Von Hand ist alles erlaubt. */
export function suitable(c: Compiled, roomI: number, hkI: number): boolean {
  return eligible(c, roomI, hkI); // F4: dieselbe harte Regel wie der Vorschlag (Stufe 1, „keine Suiten“)
}

/**
 * Kostenfunktion des Zuteilungsvorschlags (docs/autoplan.md). `assign[i]` ist der Housekeeper-Index
 * oder -1 (offen). Deterministisch, O(Zimmer).
 */
export function cost(c: Compiled, assign: Int16Array, opts: CostOptions = {}): { total: number; parts: Record<CostPart, number> } {
  const { weights: w, maxFloors, housekeepers: hks } = c.input;
  const H = hks.length;
  const credits = new Float64Array(H), turn = new Int32Array(H), deep = new Int32Array(H), stay = new Int32Array(H), linen = new Int32Array(H), dem = new Int32Array(H);
  const mask = new Int32Array(H), last = new Int32Array(H).fill(-1), count = new Int32Array(H), minutes = new Float64Array(H);
  const suites = new Int32Array(H);
  let homeMis = 0, jumps = 0, unassigned = 0, levelMis = 0, todayMis = 0, learnedMis = 0, traineeSuites = 0, restrictionHits = 0, stayMis = 0;

  for (const i of c.order) {
    const a = assign[i];
    if (a < 0) { unassigned++; continue; }
    const r = c.rooms[i];
    credits[a] += r.credits;
    count[a]++;
    if (hks[a].minutesByKind) minutes[a] += roomMinutes(hks[a], r);
    if (r.preferHk && c.hkIdx.has(r.preferHk) && hks[a].id !== r.preferHk) learnedMis++;
    if (r.minLevel && hks[a].level < r.minLevel) learnedMis++;
    const today = c.today[a];
    if (today.size && !today.has(r.floor)) todayMis++;
    if (r.kind === "STAYOVER") { if (r.laundry) linen[a]++; else stay[a]++; } else if (r.kind === "TURN") turn[a]++; else deep[a]++;
    if (r.demanding.length) { dem[a]++; if (hks[a].level < 2 && !c.relaxed[i]) levelMis++; }
    if (hks[a].type === "AZUBI" && r.demanding.includes("SUITE")) traineeSuites++;
    if (c.suite[i]) suites[a]++;
    if (c.restricted && c.restricted[i * H + a]) restrictionHits++;
    if (c.stayHk[i] >= 0 && c.stayHk[i] !== a) stayMis++;
    mask[a] |= 1 << r.floor;
    const pref = c.pref[a];
    // F9 (N3): abseits der eigenen Präferenz-Etagen ODER auf der Präferenz-Etage einer anderen Kraft
    if ((pref.size && !pref.has(r.floor)) || (!pref.has(r.floor) && c.ownedFloors.has(r.floor))) homeMis++;
    const l = last[a];
    if (l >= 0) {
      const p = c.rooms[l];
      if (p.floor !== r.floor || p.section !== r.section || c.num[i] - c.num[l] > NUMBER_JUMP_GAP) jumps++;
    }
    last[a] = i;
  }

  const parts: Record<CostPart, number> = { extraFloor: 0, credits: 0, categoryFairness: 0, demandingFairness: 0, interconnectSplit: 0, homeFloor: 0, jump: 0, unassigned: 0, levelMismatch: 0, rooms: 0, assignedFloor: 0, learned: 0, overtime: 0, traineeSuite: 0, suiteCap: 0, restriction: 0, stayContinuity: 0 };
  for (let h = 0; h < H; h++) {
    const extra = popcount(mask[h]) - maxFloors;
    if (extra > 0) parts.extraFloor += extra * w.extraFloor;
  }
  for (const [i, j] of c.pairs) if (assign[i] >= 0 && assign[j] >= 0 && assign[i] !== assign[j]) parts.interconnectSplit += w.interconnectSplit;
  parts.homeFloor = homeMis * w.homeFloor;
  parts.jump = jumps * w.jump;
  parts.assignedFloor = todayMis * (w.assignedFloor ?? 0);
  parts.learned = learnedMis * (w.learned ?? 0);
  parts.unassigned = unassigned * UNASSIGNED_PENALTY;
  parts.levelMismatch = levelMis * LEVEL1_DEMANDING_PENALTY;
  parts.traineeSuite = traineeSuites * (w.traineeSuite ?? 0);
  parts.restriction = restrictionHits * (w.restriction ?? 0);
  parts.stayContinuity = stayMis * (w.stayContinuity ?? 0);
  // Planung L1 (Regel 4): Suiten über dem Maximum je Kraft — weich
  const maxSuites = c.input.maxSuites;
  // F4 (P4): quadratisch — bei Engpass lieber 3+3 als 4+2, damit die höchste Suitenzahl je Kraft so klein wie möglich bleibt
  if (maxSuites !== undefined) for (let h = 0; h < H; h++) if (suites[h] > maxSuites) parts.suiteCap += (suites[h] - maxSuites) ** 2 * (w.suiteCap ?? 0);

  if (!opts.rulesOnly) {
    for (let h = 0; h < H; h++) {
      const { lo, hi } = hks[h];
      const cr = credits[h];
      const dev = cr < lo ? lo - cr : cr > hi ? cr - hi : 0;
      parts.credits += w.credits * (dev * dev + CENTER_PULL * (cr - c.centers[h]) ** 2 * (dev > 0 ? 0 : 1));
    }
    // H3: voraussichtlich nicht vor Schichtende fertig (nur mit Messdaten) — weich, Credits/Zimmer bleiben vorrangig
    const shift = c.input.shiftMinutes;
    if (shift) for (let h = 0; h < H; h++) if (minutes[h] > shift) parts.overtime += (w.overtime ?? 0) * ((minutes[h] - shift) / 10);
    // Zimmerzahl ist das Hauptziel (H1): Abweichung vom Zimmer-Zielband quadratisch
    for (let h = 0; h < H; h++) {
      const { roomsLo, roomsHi } = hks[h];
      if (roomsLo === undefined || roomsHi === undefined) continue;
      const n = count[h];
      const dev = n < roomsLo ? roomsLo - n : n > roomsHi ? n - roomsHi : 0;
      parts.rooms += (w.rooms ?? 0) * dev * dev;
    }
    // Plan-1b: jede Kraft eine ähnliche Mischung aus Turn, Deep clean, Tidy und Linen change — Anteil nach ihrem Zimmer-Band
    for (const cnt of [turn, deep, stay, linen]) {
      let total = 0;
      for (let h = 0; h < H; h++) total += cnt[h];
      for (let h = 0; h < H; h++) {
        const expected = (total * c.roomCenters[h]) / c.roomCenterSum;
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
