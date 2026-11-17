/**
 * Simulation „5 Hoteltage“ — Hausbestand (rein, deterministisch, nur ERFUNDENE Gäste „Test NNN“).
 * Ein Bestand über fünf Tage (Mo 16.11. – Fr 20.11.2026): Aufenthalte laufen weiter, alle Listen eines Tages
 * werden aus demselben Bestand gedruckt. Zimmer/Credits kommen aus der offiziellen Zimmerliste (ROOM_LIST).
 * Kein App-Code wird geändert; diese Datei wird nur vom Generator und von der Prüfung benutzt.
 */
import { ROOM_LIST } from "@/lib/rooms/roomList";

export const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"] as const;
export const WEEKDAY_DE = ["Mo", "Di", "Mi", "Do", "Fr"];
export const INVENTORY = 145;
export const LINEN_CYCLE = 3;
/** Allergiker-Zimmer laut Grundriss (Room.isAntiAllergic) — es gibt im Haus nur diese zwei. */
export const ALLERGY_ROOMS = ["218", "219"];

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
/** Opera-Druckformat TT/MM/JJ. */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261116);
const shuffle = <T,>(xs: T[]): T[] => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export interface SimTrace { day: number; dept: "HM" | "HK" | "FO" | "ENG"; code: string; text: string; date: string; resolvedFromDay: number | null }
export interface Guest {
  id: number; room: string; arr: string; dep: string;
  /** Vorzeitige Abreise: der Gast reist an diesem Tag ab, obwohl die Listen dieses Tages ein späteres Datum zeigen (FO meldet von Hand). */
  earlyOut?: string;
  last: string; first: string; salutation: string | null; title: string | null; lang: string;
  vip: string; adl: number; chl: number; company: string; arrTime: string;
  /** Late Check-out laut Report (Abreisezeit in der Departures-Liste). */
  lateDep?: string;
  /** Opera-Status „CHKD“ schon im Morgen-Report (Gast früh abgereist). */
  chkdOnDepDay?: boolean;
  twin?: boolean;
  traces: SimTrace[];
}

const CREDIT = new Map(ROOM_LIST.map((r) => [r.number, r.credit]));
const FLOOR = new Map(ROOM_LIST.map((r) => [r.number, r.floor]));
const CATEGORY = new Map(ROOM_LIST.map((r) => [r.number, r.category]));
export const creditOf = (room: string) => CREDIT.get(room) ?? 1;
export const floorOf = (room: string) => FLOOR.get(room) ?? Number(room[0]);
export const isSuiteClass = (room: string) => creditOf(room) >= 1.5;
/** Erfundener Opera-Zimmerart-Code je Kategorie (die App liest nur den Code). */
export const typeCode = (room: string) => ({ "CLK/DLK": Number(room) % 2 ? "CLK" : "DLK", "Junior Suite": "JSK", Suite: "STE", "Deluxe Suite": "DST", Präsidentensuite: "PRS" } as Record<string, string>)[CATEGORY.get(room) ?? "CLK/DLK"] ?? "CLK";

const FIRST_F = ["Anna", "Gerda", "Eva", "Ida", "Karin", "Carla", "Lena", "Nora", "Mia"];
const FIRST_M = ["Jonas", "Bernd", "Franz", "Max", "Leo", "Paul", "Emil"];
const LANGS = ["DE", "DE", "DE", "DE", "EN", "EN", "EN", "FR", "ES", "IT", "DE", "EN", "ZH", "AR", "RU", "JA", "TR", "DE", "EN", "DE"];
const COMPANIES = ["", "", "", "", "", "Muster GmbH", "", "", "", "", "", "Beispiel AG", "", "", "", "", "", "Demo KG"];

/** Drehbuch: Anreisen je Tag, aufgeteilt nach Abreisetag (Index 1–5 = Tag, 6 = später), und gewünschte Same-Day-Turns. */
const INITIAL: [number, number][] = [[1, 40], [2, 52], [3, 16], [4, 8], [5, 3], [6, 9]];
const ARRIVALS: Record<number, [number, number][]> = {
  1: [[2, 18], [3, 5], [5, 6], [6, 6]], // 35 — davon 12 bleiben ≥ 4 Nächte (P8, P13)
  2: [[3, 17], [4, 14], [5, 3], [6, 3]], // 37 — 15 Turns, 6 VIP auf Etage 5
  3: [[4, 8], [5, 6], [6, 12]], // 26
  4: [[5, 2], [6, 13]], // 15
  5: [[6, 30]], // 30
};
const TURNS: Record<number, number> = { 1: 18, 2: 15, 3: 5, 4: 2, 5: 4 };
const EARLY_OUTS_DAY2 = 5;

export interface House {
  guests: Guest[];
  /** Zimmer außer Betrieb ab Tag 5 (im Forecast als OOO), und der Zimmerwechsel an Tag 5. */
  oooDay5: string[];
  roomMoveDay5: { from: string; to: string; guestId: number };
  day2ManualLate: string[];
  greenOptionDay4: string;
  tag1LongStayers: string[];
}

function makeGuest(id: number, room: string, arr: string, dep: string): Guest {
  const lang = LANGS[(id * 7) % LANGS.length];
  const female = id % 2 === 0;
  const salutation = id % 23 === 0 ? null : lang === "DE" ? (female ? "Frau" : "Herr") : female ? (id % 4 === 0 ? "Ms." : "Mrs.") : "Mr.";
  const title = id % 31 === 0 ? "Prof." : id % 9 === 0 ? "Dr." : null;
  const adl = id % 3 === 0 ? 1 : 2;
  const chl = id % 14 === 0 ? 2 : id % 8 === 0 ? 1 : 0;
  return {
    id, room, arr, dep, last: `Test ${String(id).padStart(3, "0")}`, first: female ? FIRST_F[(id * 5) % FIRST_F.length] : FIRST_M[(id * 5) % FIRST_M.length], salutation, title, lang,
    vip: id % 11 === 0 ? "V1" : id % 17 === 0 ? "V2" : "", adl, chl, company: COMPANIES[id % COMPANIES.length],
    arrTime: `${String(13 + (id % 8)).padStart(2, "0")}:${String((id * 5) % 60).padStart(2, "0")}`, traces: [],
  };
}

export function buildHouse(): House {
  const all = ROOM_LIST.map((r) => r.number);
  const free = new Set(all);
  const guests: Guest[] = [];
  let nextId = 1;
  const dayDate = (k: number, id: number) => (k <= 5 ? DAYS[k - 1] : addDays(DAYS[4], 1 + (id % 5)));
  const take = (pool: string[], prefer?: (r: string) => boolean): string => {
    const cands = pool.filter((r) => free.has(r));
    const pick = (prefer ? cands.find(prefer) : undefined) ?? cands[0];
    if (!pick) throw new Error("Simulation: kein freies Zimmer im Pool");
    free.delete(pick);
    return pick;
  };

  // ── Bestand am Morgen von Tag 1 (128 Zimmer belegt, 17 frei) ──
  const order = shuffle(all);
  // Tag 3 = Engpass: viele Suiten- und beide Allergiker-Abreisen
  const day3Forced = ["304", "101", "104", "204", "302", "526", "218", "219", "110", "125", "202", "203", "309", "325", "425", "428"];
  // Tag 2: Etage 5 reist ab, damit die 6 VIP-Anreisen dort landen (als Turns)
  const day2Forced = ["515", "517", "518", "519", "521", "522", "523", "524"];
  const initialRoom = (k: number, i: number): string => {
    if (k === 3 && i < day3Forced.length) return take([day3Forced[i]]);
    if (k === 2 && i < day2Forced.length) return take([day2Forced[i]]);
    return take(order.filter((r) => !day3Forced.includes(r) && !day2Forced.includes(r)));
  };
  for (const k of [3, 2, 1, 4, 5, 6]) {
    const n = INITIAL.find(([d]) => d === k)![1];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      guests.push(makeGuest(id, initialRoom(k, i), addDays(DAYS[0], -(1 + (id % 9))), dayDate(k, id)));
    }
  }
  // 5 vorzeitige Abreisen an Tag 2 (Listen zeigen ein späteres Datum)
  guests.filter((g) => g.dep > DAYS[4]).slice(0, EARLY_OUTS_DAY2).forEach((g) => { g.earlyOut = DAYS[1]; });

  let oooDay5: string[] = [];
  let roomMoveDay5 = { from: "", to: "", guestId: 0 };

  for (let d = 1; d <= 5; d++) {
    const today = DAYS[d - 1];
    const vacantBefore = all.filter((r) => free.has(r));
    const departing = guests.filter((g) => g.dep === today);
    const turnPool = shuffle(departing.map((g) => g.room));
    for (const r of turnPool) free.add(r);
    let vacPool = shuffle(vacantBefore);
    if (d === 5) {
      // Zwei Zimmer außer Betrieb und ein Ziel für den Zimmerwechsel: bleiben frei
      oooDay5 = vacPool.filter((r) => !isSuiteClass(r)).slice(0, 2);
      const target = vacPool.find((r) => !oooDay5.includes(r) && !isSuiteClass(r))!;
      vacPool = vacPool.filter((r) => !oooDay5.includes(r) && r !== target);
      const mover = guests.find((g) => g.arr < today && g.dep > today && !g.earlyOut && floorOf(g.room) !== floorOf(target) && !isSuiteClass(g.room))!;
      roomMoveDay5 = { from: mover.room, to: target, guestId: mover.id };
    }
    const plan = shuffle(ARRIVALS[d].flatMap(([k, n]) => Array.from({ length: n }, () => k)));
    let turnsLeft = TURNS[d];
    plan.forEach((k, i) => {
      const id = nextId++;
      const vipFloor5 = d === 2 && i < 6;
      const prefer = vipFloor5 ? (r: string) => floorOf(r) === 5 : k === 3 ? isSuiteClass : (r: string) => !isSuiteClass(r);
      const turnsNeededLater = turnsLeft >= plan.length - i; // Rest muss komplett aus den Abreise-Zimmern kommen
      const vacLeft = vacPool.filter((r) => free.has(r)).length;
      const asTurn = turnsLeft > 0 && (vipFloor5 || turnsNeededLater || vacLeft === 0 || (i % 2 === 0));
      const room = asTurn ? take(turnPool, prefer) : take(vacPool, prefer);
      if (asTurn) turnsLeft--;
      const g = makeGuest(id, room, today, dayDate(k, id));
      if (vipFloor5) { g.vip = ["V1", "V1", "V2", "V2", "V3", "V3"][i]; g.arrTime = `1${1 + (i % 3)}:${i % 2 ? "30" : "00"}`; }
      guests.push(g);
    });
    if (turnsLeft !== 0) throw new Error(`Simulation Tag ${d}: Turns gehen nicht auf (${turnsLeft} übrig)`);
    // Vorzeitig Abgereiste: Zimmer ab morgen wieder frei
    if (d === 2) for (const g of guests.filter((x) => x.earlyOut === today)) free.add(g.room);
    // Am Abend: nur noch die Zimmer sind frei, in denen heute Nacht niemand schläft
    for (const g of guests) if (g.arr <= today && g.dep > today && !(g.earlyOut && g.earlyOut <= today)) free.delete(g.room);
  }

  addDetails(guests, roomMoveDay5);
  const tag1 = guests.filter((g) => g.arr === DAYS[0] && g.dep >= DAYS[4]);
  const day2Deps = guests.filter((g) => g.dep === DAYS[1] && !g.lateDep && !g.chkdOnDepDay);
  return {
    guests, oooDay5, roomMoveDay5,
    day2ManualLate: day2Deps.slice(10, 12).map((g) => g.room),
    greenOptionDay4: tag1.find((g) => g.dep > DAYS[4])!.room,
    tag1LongStayers: tag1.map((g) => g.room).sort(),
  };
}

/** Sichtbar in den Listen von Tag d (vorzeitig Abgereiste fehlen ab dem Folgetag). */
export const visibleOn = (g: Guest, today: string) => g.arr <= today && !(g.earlyOut && today > g.earlyOut);
export const departingOn = (g: Guest, today: string) => visibleOn(g, today) && g.dep === today;
export const stayingOn = (g: Guest, today: string) => visibleOn(g, today) && g.arr < today && g.dep > today;
export const arrivingOn = (g: Guest, today: string) => g.arr === today && g.dep > today;

function addDetails(guests: Guest[], move: { from: string; to: string; guestId: number }) {
  const LCO: Record<number, number> = { 1: 3, 2: 3, 3: 4, 4: 2, 5: 2 };
  const CHKD: Record<number, number> = { 1: 0, 2: 3, 3: 2, 4: 0, 5: 1 };
  for (let d = 1; d <= 5; d++) {
    const today = DAYS[d - 1];
    const add = (g: Guest, dept: SimTrace["dept"], code: string, text: string) => {
      if (g.traces.some((t) => t.day === d && t.code === code && t.text === text)) return;
      // 70 % sind am Folgetag erledigt, der Rest bleibt offen in der Liste
      g.traces.push({ day: d, dept, code, text, date: today, resolvedFromDay: (g.id + d) % 10 < 7 ? d + 1 : null });
    };
    const dep = guests.filter((g) => departingOn(g, today));
    const arrivingRooms = new Set(guests.filter((g) => arrivingOn(g, today)).map((g) => g.room));
    // Late Check-out: bevorzugt bei Turns (Druck auf das Zimmer) — Uhrzeit steht im Report
    const lco = [...dep.filter((g) => arrivingRooms.has(g.room)), ...dep.filter((g) => !arrivingRooms.has(g.room))].slice(0, LCO[d]);
    lco.forEach((g, i) => { g.lateDep = ["14:00", "13:00", "15:00", "12:30"][i % 4]; add(g, "FO", "LCO", `Late check-out until ${g.lateDep} confirmed`); });
    dep.filter((g) => !g.lateDep).slice(4, 4 + CHKD[d]).forEach((g) => { g.chkdOnDepDay = true; });
    for (const g of dep) if (g.twin) add(g, "HM", "TWIN", "Twin back to king after departure");

    guests.filter((g) => arrivingOn(g, today)).forEach((g, i) => {
      if (i % 5 === 0) { g.twin = true; add(g, "HM", "TWIN", "Twin beds please"); }
      if (g.chl > 0 || i % 7 === 3) add(g, "HM", "XBED", g.chl > 1 ? "Extra bed for 2 children" : "Extra bed for 1 child");
      if (i % 9 === 4) add(g, "HM", "XBED", i % 18 === 4 ? "Baby cot for child, 2 years old" : "Baby cot (Babybett) please");
      if (g.vip) add(g, "HK", "HK", "VIP amenity: fruit plate and welcome card");
      if (i % 8 === 2 || ALLERGY_ROOMS.includes(g.room)) add(g, "HK", "HK", "Allergy: feather-free bedding, no down pillows");
      if (i % 11 === 6) add(g, "HK", "HK", "Extra towels and bathrobes");
    });
    guests.filter((g) => stayingOn(g, today)).forEach((g, i) => {
      if (i % 13 === 5) add(g, "HK", "HK", "Guest requests cleaning after 13:00");
      if (i % 17 === 8) add(g, "ENG", "ENG", "Minibar door loose");
      if (i % 19 === 11) add(g, "FO", "FO", "Room move requested (noise), offer alternative");
      if (d === 5 && g.id === move.guestId) add(g, "FO", "FO", `Room move to ${move.to} today, luggage transfer 11:00`);
    });
  }
}

export interface TraceLine { room: string; guestId: number; dept: string; code: string; date: string; text: string; resolved: boolean }
/** Traces-Liste von Tag d: heutige Traces + die von gestern (erledigt oder noch offen) für Gäste, die noch in den Listen stehen. */
export function tracesOn(h: House, d: number): TraceLine[] {
  const today = DAYS[d - 1];
  const out: TraceLine[] = [];
  for (const g of h.guests) {
    if (!visibleOn(g, today) || g.dep < today) continue;
    for (const t of g.traces) {
      if (t.day === d) out.push({ room: g.room, guestId: g.id, dept: t.dept, code: t.code, date: t.date, text: t.text, resolved: false });
      else if (t.day === d - 1) out.push({ room: g.room, guestId: g.id, dept: t.dept, code: t.code, date: t.date, text: t.text, resolved: t.resolvedFromDay !== null && t.resolvedFromDay <= d });
    }
  }
  return out.sort((a, b) => a.room.localeCompare(b.room) || a.code.localeCompare(b.code) || a.text.localeCompare(b.text));
}

export interface ForecastLine { date: string; occ: number; arr: number; dep: number; ooo: number; persons: number }
/** Forecast-Zeile, wie Opera sie am Morgen von Tag d für `date` kennt. */
export function forecastLine(h: House, d: number, date: string): ForecastLine {
  const today = DAYS[d - 1];
  const k = diff(DAYS[0], date);
  if (date < DAYS[0]) return { date, occ: 120 - k, arr: 30 + (-k % 4), dep: 28 + (-k % 5), ooo: 0, persons: 190 - k };
  const seen = h.guests.filter((g) => !(g.earlyOut && today > g.earlyOut));
  // Vorzeitig Abgereiste zählen in der Rückschau (History) am Tag ihrer echten Abreise
  const depOf = (g: Guest) => (g.earlyOut && today > g.earlyOut ? g.earlyOut : g.dep);
  const everyone = h.guests;
  const inHouse = (date < today ? everyone : seen).filter((g) => g.arr <= date && depOf(g) > date);
  let occ = inHouse.length, arr = everyone.filter((g) => g.arr === date).length, dep = (date < today ? everyone : seen).filter((g) => depOf(g) === date).length;
  let persons = inHouse.reduce((a, g) => a + g.adl + g.chl, 0);
  if (date > DAYS[4]) { const j = diff(DAYS[4], date); occ += 38 + ((j * 7) % 25); arr += 12 + (j % 9); dep += 10 + (j % 7); persons += 60 + j * 3; }
  return { date, occ, arr, dep, ooo: d === 5 && date >= DAYS[4] ? h.oooDay5.length : 0, persons };
}

export interface DayExpect {
  tag: number; date: string; wochentag: string;
  abreisen: number; davonTurns: number; anreisen: number; bleiber: number; belegtHeuteNacht: number; auslastungPct: number;
  zuReinigen: number; waeschewechsel: number; personenHeuteNacht: number;
  vipAnreisen: number; vipAnreisenEtage5: number; suitenAbreisen: number; grosseSuitenAbreisen: number; allergikerAbreisen: number;
  lateCheckoutImReport: number; ausgechecktImReport: number;
  traces: { zeilen: number; offen: number; erledigt: number; offenJeAbteilung: Record<string, number> };
  departuresListe: { heute: number; morgen: number; uebermorgen: number; zeilen: number };
  inhouseListe: { zeilen: number; ckin: number; resv: number };
  zimmer: Record<string, string[]>;
  manuellImTagesverlauf: Record<string, unknown>;
  erwarteteHinweise: string[];
}

export function expectDay(h: House, d: number): DayExpect {
  const today = DAYS[d - 1];
  const dep = h.guests.filter((g) => departingOn(g, today));
  const stay = h.guests.filter((g) => stayingOn(g, today));
  const arr = h.guests.filter((g) => arrivingOn(g, today));
  const arrRooms = new Set(arr.map((g) => g.room));
  const turns = dep.filter((g) => arrRooms.has(g.room));
  const laundry = stay.filter((g) => diff(g.arr, today) % LINEN_CYCLE === 0);
  const tr = tracesOn(h, d);
  const open = tr.filter((t) => !t.resolved);
  const DEPT: Record<string, string> = { TWIN: "HOUSEMAN", XBED: "HOUSEMAN", HK: "HOUSEKEEPING", ENG: "ENGINEERING", FO: "FRONT_OFFICE", LCO: "FRONT_OFFICE" };
  const byDept: Record<string, number> = {};
  for (const t of open) byDept[DEPT[t.code]] = (byDept[DEPT[t.code]] ?? 0) + 1;
  const depOn = (k: number) => h.guests.filter((g) => visibleOn(g, today) && g.dep === addDays(today, k)).length;
  const rooms = (gs: Guest[]) => gs.map((g) => g.room).sort();
  const manuell: Record<string, unknown> = {};
  if (d === 2) {
    manuell.zusaetzlicheCheckouts = rooms(h.guests.filter((g) => g.earlyOut === today));
    manuell.lateCheckoutsVonHand = h.day2ManualLate;
    manuell.hinweis = "Front Office trägt beides von Hand ein, kein Nachimport (P14, B3).";
  }
  if (d === 3) manuell.hinweis = "Die 5 vorzeitig Abgereisten von Tag 2 fehlen in den heutigen Listen (Aufenthalt endet früher als gestern gedruckt).";
  if (d === 4) manuell.greenOption = { zimmer: h.greenOptionDay4, hinweis: "Gast wählt im Gäste-Screen die Green Option: Wäschewechsel heute ausgesetzt (P8) → Wäschewechsel dann 1 weniger." };
  if (d === 5) {
    manuell.ausserBetrieb = h.oooDay5;
    manuell.zimmerwechsel = { von: h.roomMoveDay5.from, nach: h.roomMoveDay5.to, hinweis: "Listen zeigen den Gast noch im alten Zimmer; Freigabe nur Supervisor/DM (B5)." };
  }
  const occ = stay.length + arr.length;
  return {
    tag: d, date: today, wochentag: WEEKDAY_DE[d - 1],
    abreisen: dep.length, davonTurns: turns.length, anreisen: arr.length, bleiber: stay.length, belegtHeuteNacht: occ,
    auslastungPct: Math.round((occ / (INVENTORY - (d === 5 ? h.oooDay5.length : 0))) * 10000) / 100,
    zuReinigen: dep.length + stay.length, waeschewechsel: laundry.length, personenHeuteNacht: [...stay, ...arr].reduce((a, g) => a + g.adl + g.chl, 0),
    vipAnreisen: arr.filter((g) => g.vip).length, vipAnreisenEtage5: arr.filter((g) => g.vip && floorOf(g.room) === 5).length,
    suitenAbreisen: dep.filter((g) => isSuiteClass(g.room)).length, grosseSuitenAbreisen: dep.filter((g) => creditOf(g.room) >= 1.75).length,
    allergikerAbreisen: dep.filter((g) => ALLERGY_ROOMS.includes(g.room)).length,
    lateCheckoutImReport: dep.filter((g) => g.lateDep).length, ausgechecktImReport: dep.filter((g) => g.chkdOnDepDay).length,
    traces: { zeilen: tr.length, offen: open.length, erledigt: tr.length - open.length, offenJeAbteilung: byDept },
    departuresListe: { heute: depOn(0), morgen: depOn(1), uebermorgen: depOn(2), zeilen: depOn(0) + depOn(1) + depOn(2) },
    inhouseListe: { zeilen: occ, ckin: stay.length, resv: arr.length },
    zimmer: {
      abreisen: rooms(dep), turns: rooms(turns), anreisen: rooms(arr), bleiber: rooms(stay), waeschewechsel: rooms(laundry),
      vipAnreisen: rooms(arr.filter((g) => g.vip)), lateCheckoutImReport: rooms(dep.filter((g) => g.lateDep)), ausgechecktImReport: rooms(dep.filter((g) => g.chkdOnDepDay)),
      suitenAbreisen: rooms(dep.filter((g) => isSuiteClass(g.room))),
      tag1Langbleiber: h.tag1LongStayers.filter((r) => stay.some((g) => g.room === r && g.arr === DAYS[0])),
      tag1LangbleiberWaesche: rooms(laundry.filter((g) => g.arr === DAYS[0])),
    },
    manuellImTagesverlauf: manuell,
    erwarteteHinweise: ["PERIOD_SHORT (Departures decken nur 3 Tage ab — wie im Hotel üblich)", "DATE_FORMAT_DIFFERS als Hinweis (TT/MM/JJ)"],
  };
}
