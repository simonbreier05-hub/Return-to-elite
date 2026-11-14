/**
 * Planung L1 (Entscheidungen der Housekeeping-Leitung vom 13.11.2026) — ein Test je Regel.
 * Nur erfundene Daten, keine Gastnamen.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_LINEN_CYCLE_DAYS, DEFAULT_SETTINGS } from "@/lib/domain";
import { creditMinutes, computeRoomCredit } from "@/lib/rooms/roomCredit";
import { ROOM_LIST } from "@/lib/rooms/roomList";
import { roomBand, bandTarget } from "@/lib/planung/floorTeam";
import { bandFor } from "@/lib/autoplan/load";
import { buildResult } from "@/lib/autoplan/result";
import { compile, cost } from "@/lib/autoplan/cost";
import { proposePlan as propose } from "@/lib/autoplan/propose";
import { orderRoute as planRoute } from "@/lib/autoplan/route";
import { isSuite, parseRestrictions, restrictionHit, type PlanRoom } from "@/lib/autoplan/types";
import { toIndexAssignment } from "@/lib/autoplan/result";
import { deriveDayPlan } from "@/lib/dayplan/derive";
import { LIST_TIER, isCheckedOut, listTier, parseCleanWish, sortByListOrder, type ListOrderInput } from "@/lib/planung/listOrder";
import { orderRoute as hkOrderRoute } from "@/lib/rooms/hkGroups";
import { lastCleanerByStay } from "@/lib/learning/stayContinuity";
import { hkMarkers } from "@/lib/ui/hkHub";
import { hk, makeDay, makeInput } from "../autoplan/scenario";

const S = DEFAULT_SETTINGS as unknown as Record<string, number>;

const room = (id: string, extra: Partial<PlanRoom> = {}): PlanRoom => ({
  id, number: id.replace(/\D/g, "") || "101", floor: 1, section: "1A", kind: "STAYOVER", laundry: false, vip: false, eta: null,
  credits: 1, demanding: [], traces: 0, interconnect: [], state: "TODO", fixedTo: null, ...extra,
});

describe("Regel 1 — Credits = Zimmergröße, Zeit je Credit", () => {
  it("Zimmerliste v2.1 kennt genau die Credits 1 · 1,5 · 1,75 · 2 · 3,5", () => {
    expect([...new Set(ROOM_LIST.map((r) => r.credit))].sort((a, b) => a - b)).toEqual([1, 1.5, 1.75, 2, 3.5]);
  });
  it("Room.credit gilt vor dem Kategorie-Wert", () => {
    expect(computeRoomCredit({ type: "SUITE", credits: { UNVERIFIED: 1, CLASSIC: 1, SUPERIOR: 1, DELUXE: 1.25, JUNIOR_SUITE: 1.5, SUITE: 2, PENTHOUSE: 2 }, roomCredit: 1.75 })).toBe(1.75);
  });
  it("1 = 40 min, 1,5 = 60, 1,75 = 70, 2 = 80, 3,5 = 140 (Standard minutesPerCredit 40)", () => {
    expect(DEFAULT_SETTINGS.minutesPerCredit).toBe(40);
    expect([1, 1.5, 1.75, 2, 3.5].map((c) => creditMinutes(c, DEFAULT_SETTINGS.minutesPerCredit))).toEqual([40, 60, 70, 80, 140]);
  });
  it("die alte 0,7-Regel für Bleiber ist weg (Zeitfaktoren Standard 1)", () => {
    expect(DEFAULT_SETTINGS.stayoverFactor).toBe(1);
    expect(DEFAULT_SETTINGS.stayoverLaundryFactor).toBe(1);
  });
});

describe("Regel 2 — Zielwerte und Credit-Toleranz", () => {
  it("Ziel Vollzeit 11, Teilzeit 7, Azubi 7 Zimmer; Springer wie Vollzeit", () => {
    expect(bandTarget(roomBand("VOLLZEIT", S))).toBe(11);
    expect(bandTarget(roomBand("TEILZEIT", S))).toBe(7);
    expect(bandTarget(roomBand("AZUBI", S))).toBe(7);
    expect(bandTarget(roomBand("EXTERN", S))).toBe(11);
  });
  it("Zimmerzahl möglichst nicht überschreiten: Ziel ist die Obergrenze, auch beim persönlichen Tagesziel", () => {
    expect(roomBand("VOLLZEIT", S).hi).toBe(11);
    expect(roomBand("VOLLZEIT", S, 9)).toEqual({ lo: 8, hi: 9 });
  });
  it("Credit-Band = Ziel × Ø Credit ± 1,5 (angepasst an den Status der Kraft)", () => {
    expect(DEFAULT_SETTINGS.creditTolerance).toBe(1.5);
    expect(bandFor(roomBand("VOLLZEIT", S), 1.2, 1.5)).toEqual({ lo: 11.7, hi: 14.7 });
    expect(bandFor(roomBand("TEILZEIT", S), 1.2, 1.5)).toEqual({ lo: 6.9, hi: 9.9 });
  });
  it("ein 12. Zimmer kostet mehr als das 11. (weich, keine Sperre)", () => {
    const h = { ...hk("a", "VOLLZEIT", 2), roomsLo: 10, roomsHi: 11 };
    const rooms = Array.from({ length: 12 }, (_, i) => room(`r${101 + i}`));
    const c = compile({ ...makeInput(rooms, [h]) });
    const all = toIndexAssignment(c, Object.fromEntries(rooms.map((r) => [r.id, "a"])));
    const eleven = toIndexAssignment(c, Object.fromEntries(rooms.map((r, i) => [r.id, i < 11 ? "a" : null])));
    expect(cost(c, all).parts.rooms).toBeGreaterThan(0);
    expect(cost(c, eleven).parts.rooms).toBe(0);
  });
});

describe("Regel 3 — Fairness der Mischung", () => {
  it("vier Kräfte bekommen je eine ähnliche Mischung aus Abreisen, Bleibern, Turns und Wäschewechseln", () => {
    const rooms = makeDay(44);
    const hks = ["a", "b", "c", "d"].map((id) => ({ ...hk(id, "VOLLZEIT", 2), roomsLo: 10, roomsHi: 11 }));
    const res = propose(makeInput(rooms, hks));
    const spread = (f: (m: (typeof res.metrics)[number]) => number) => Math.max(...res.metrics.map(f)) - Math.min(...res.metrics.map(f));
    expect(spread((m) => m.departures)).toBeLessThanOrEqual(2);
    expect(spread((m) => m.linen)).toBeLessThanOrEqual(2);
    expect(spread((m) => m.stayovers)).toBeLessThanOrEqual(3);
  });
});

describe("Regel 4 — höchstens 2 Suiten je Housekeeper (weich)", () => {
  it("Suite = ab 1,5 Credits (Einstellung suiteMinCredit)", () => {
    expect(isSuite(room("r1", { credits: 1.5 }), 1.5)).toBe(true);
    expect(isSuite(room("r1", { credits: 1 }), 1.5)).toBe(false);
    expect(isSuite(room("r1", { credits: 1.5 }), 1.75)).toBe(false);
  });
  it("3 Suiten bei einer Kraft = Warnung TOO_MANY_SUITES und Kosten, aber zugeteilt", () => {
    const rooms = ["r101", "r102", "r103"].map((id) => room(id, { credits: 2, demanding: ["SUITE"] }));
    const input = { ...makeInput(rooms, [hk("a", "VOLLZEIT", 3)]), maxSuites: 2, suiteMinCredit: 1.5 };
    const res = buildResult(input, { r101: "a", r102: "a", r103: "a" });
    expect(res.unassigned).toEqual([]);
    expect(res.warnings.some((w) => w.code === "TOO_MANY_SUITES" && w.hkId === "a")).toBe(true);
    expect(res.cost.parts.suiteCap).toBeGreaterThan(0);
  });
  it("der Vorschlag verteilt Suiten so, dass niemand über 2 kommt, wenn es geht", () => {
    const rooms = Array.from({ length: 6 }, (_, i) => room(`r${101 + i}`, { credits: 2, demanding: ["SUITE"] }));
    const input = { ...makeInput(rooms, [hk("a", "VOLLZEIT", 3), hk("b", "VOLLZEIT", 3), hk("c", "VOLLZEIT", 3)]), maxSuites: 2, suiteMinCredit: 1.5 };
    const res = propose(input);
    expect(res.warnings.filter((w) => w.code === "TOO_MANY_SUITES")).toEqual([]);
  });
});

describe("Regel 5 — Präferenz-Etagen, Springer, Einschränkungen", () => {
  it("Einschränkungen werden nur als bekannte Codes gelesen", () => {
    expect(parseRestrictions("NO_SUITE, NO_VIP,FOO,NO_SUITE")).toEqual(["NO_SUITE", "NO_VIP"]);
    expect(parseRestrictions("")).toEqual([]);
  });
  it("„keine Suiten“: Treffer, Warnung RESTRICTION und Kosten — nie eine Sperre", () => {
    const suite = room("r101", { credits: 2, demanding: ["SUITE"] });
    const h = hk("a", "VOLLZEIT", 3, { restrictions: ["NO_SUITE"] });
    expect(restrictionHit(h, suite, 1.5)).toBe("NO_SUITE");
    const res = buildResult({ ...makeInput([suite], [h]), suiteMinCredit: 1.5 }, { r101: "a" });
    expect(res.warnings.some((w) => w.code === "RESTRICTION")).toBe(true);
    expect(res.cost.parts.restriction).toBeGreaterThan(0);
  });
  it("der Vorschlag gibt die Suite lieber der Kraft ohne Einschränkung", () => {
    const rooms = [room("r101", { credits: 2, demanding: ["SUITE"] }), room("r102")];
    const res = propose({ ...makeInput(rooms, [hk("a", "VOLLZEIT", 3, { restrictions: ["NO_SUITE"] }), hk("b", "VOLLZEIT", 3)]), suiteMinCredit: 1.5 });
    expect(res.assignment.r101).toBe("b");
  });
  it("Präferenz-Etagen kosten bei anderen Etagen — beim Springer (EXTERN) nicht", () => {
    const r = room("r301", { floor: 3, section: "3A", number: "301" });
    const fix = (type: "VOLLZEIT" | "EXTERN") => {
      const c = compile(makeInput([r], [hk("a", type as "VOLLZEIT", 2, { homeFloors: [1, 2] })]));
      return cost(c, toIndexAssignment(c, { r301: "a" })).parts.homeFloor;
    };
    expect(fix("VOLLZEIT")).toBeGreaterThan(0);
    expect(fix("EXTERN")).toBe(0);
  });
});

describe("Regel 6 — Level 1 mit anspruchsvollen Zimmern = Warnung, keine Sperre", () => {
  it("VIP-Zimmer bei Stufe 1 bleibt zugeteilt, mit Warnung LEVEL1_DEMANDING", () => {
    const res = buildResult(makeInput([room("r101", { vip: true, demanding: ["VIP"] })], [hk("a", "VOLLZEIT", 1)]), { r101: "a" });
    expect(res.assignment.r101).toBe("a");
    expect(res.warnings.some((w) => w.code === "LEVEL1_DEMANDING")).toBe(true);
  });
});

describe("Regel 7 — Reihenfolge in der Housekeeper-Liste", () => {
  const base: ListOrderInput = { kind: "STAYOVER", rush: false, serviceNow: false, cleanAfter: null, checkedOut: false };
  const rows = [
    { id: "dep", number: "101", routeOrder: 0, o: { ...base, kind: "DEPARTURE" as const } },
    { id: "stay", number: "102", routeOrder: 1, o: { ...base } },
    { id: "turnWait", number: "103", routeOrder: 2, o: { ...base, kind: "SAME_DAY_TURN" as const } },
    { id: "turnOut", number: "104", routeOrder: 3, o: { ...base, kind: "SAME_DAY_TURN" as const, checkedOut: true } },
    { id: "now", number: "105", routeOrder: 4, o: { ...base, serviceNow: true } },
    { id: "later", number: "106", routeOrder: 5, o: { ...base, cleanAfter: "13:00" } },
    { id: "rush", number: "107", routeOrder: 6, o: { ...base, kind: "DEPARTURE" as const, rush: true } },
  ];
  it("Rush → Service Now → Turn (ausgecheckt) → Bleiber → Turn (noch belegt) → Abreise → „ab 13 Uhr“", () => {
    const sorted = sortByListOrder(rows, (r) => listTier(r.o, "09:00")).map((r) => r.id);
    expect(sorted).toEqual(["rush", "now", "turnOut", "stay", "turnWait", "dep", "later"]);
  });
  it("VIP ist keine eigene Stufe mehr", () => {
    expect(Object.keys(LIST_TIER)).not.toContain("VIP");
    const vipStay = room("r1", { vip: true, demanding: ["VIP"] }), turn = room("r2", { kind: "TURN" }), dep = room("r3", { kind: "DEPARTURE" });
    expect(planRoute([dep, vipStay, turn]).map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
  });
  it("Housekeeper-Hub nutzt dieselbe Stufe vor der gespeicherten Route", () => {
    const hubRooms = rows.map((r) => ({ id: r.id, number: r.number, floor: 1, routeOrder: r.routeOrder }));
    const tier = new Map(rows.map((r) => [r.id, listTier(r.o, "09:00")]));
    expect(hkOrderRoute(hubRooms, () => 0, (r) => tier.get(r.id)!).map((r) => r.id)).toEqual(["rush", "now", "turnOut", "stay", "turnWait", "dep", "later"]);
  });
  it("ausgecheckt = Stay CHECKED_OUT oder Opera-Code CHKD", () => {
    expect(isCheckedOut({ status: "CHECKED_OUT" })).toBe(true);
    expect(isCheckedOut({ status: "IN_HOUSE", resStatus: "chkd" })).toBe(true);
    expect(isCheckedOut({ status: "IN_HOUSE", resStatus: "DUOT" })).toBe(false);
    expect(isCheckedOut(null)).toBe(false);
  });
});

describe("Regel 8 — Wäschewechsel ab der 1. Nacht (alle Kategorien)", () => {
  const guest = { salutation: null, title: null, lastName: "Test", fullName: "Test" };
  const kindOn = (date: string) => deriveDayPlan({
    date, departures: [], arrivals: [], linenCycleDays: DEFAULT_LINEN_CYCLE_DAYS,
    inHouse: [{ room: "305", guest, arrDate: "2026-11-14", depDate: "2026-11-20", adults: 2, children: 0, nights: 6, vip: false, status: "CKIN" }],
  }).rooms.find((r) => r.room === "305");
  it("Anreise 14.11. → 15.11. Tidy → 16.11. Tidy → 17.11. Wäschewechsel", () => {
    expect(kindOn("2026-11-15")).toMatchObject({ cleaningType: "STAYOVER", laundryDue: false });
    expect(kindOn("2026-11-16")).toMatchObject({ cleaningType: "STAYOVER", laundryDue: false });
    expect(kindOn("2026-11-17")).toMatchObject({ cleaningType: "STAYOVER", laundryDue: true });
    expect(kindOn("2026-11-18")).toMatchObject({ cleaningType: "STAYOVER", laundryDue: false });
    expect(kindOn("2026-11-20")).toMatchObject({ cleaningType: "DEPARTURE" });
  });
});

describe("Regel 9 — Gastwunsch „Reinigung ab 13 Uhr“", () => {
  it("wird gelesen, rückt nach hinten und ab 13:00 wieder normal", () => {
    expect(parseCleanWish(JSON.stringify({ timing: "LATER", time: "13:00" }))).toEqual({ serviceNow: false, cleanAfter: "13:00" });
    expect(parseCleanWish(JSON.stringify({ timing: "NOW" }))).toEqual({ serviceNow: true, cleanAfter: null });
    expect(parseCleanWish("kaputt")).toEqual({ serviceNow: false, cleanAfter: null });
    const r: ListOrderInput = { kind: "STAYOVER", rush: false, serviceNow: false, cleanAfter: "13:00", checkedOut: false };
    expect(listTier(r, "10:30")).toBe(LIST_TIER.LATER);
    expect(listTier(r, "13:00")).toBe(LIST_TIER.STAYOVER);
  });
  it("die Uhrzeit ist im Housekeeper-Hub als Marker sichtbar", () => {
    const v = { id: "x", number: "305", status: "DIRTY" as const, kind: "STAYOVER" as const, vip: false, laundry: false, dnd: false, paused: false, defects: 0, eta: null, early: false, urgent: false, cleanAfter: "13:00" };
    expect(hkMarkers(v)).toContain("later");
  });
});

describe("Regel 10 — Rush springt ganz nach oben", () => {
  it("auch vor Service Now und vor „ab 13 Uhr“", () => {
    const r: ListOrderInput = { kind: "DEPARTURE", rush: true, serviceNow: true, cleanAfter: "13:00", checkedOut: false };
    expect(listTier(r, "09:00")).toBe(LIST_TIER.RUSH);
  });
});

describe("Regel 11 — Krankmeldung: kein automatischer Vorschlag", () => {
  it("Standard ist aus", () => {
    expect(DEFAULT_SETTINGS.redistributeOnAbsence).toBe(0);
  });
});

describe("Regel 13 — gleiche Kraft beim selben Aufenthalt (weich)", () => {
  const checkIn = new Date("2026-11-14T00:00:00Z");
  const before = new Date("2026-11-17T00:00:00Z");
  const hks = new Set(["a", "b"]);
  it("nimmt die letzte Reinigung im selben Aufenthalt, nicht davor, nicht von Supervisoren", () => {
    const m = lastCleanerByStay([{ roomId: "r305", stayId: "s1", checkIn }], [
      { roomId: "r305", userId: "b", at: new Date("2026-11-13T10:00:00Z") }, // voriger Gast
      { roomId: "r305", userId: "a", at: new Date("2026-11-15T10:00:00Z") },
      { roomId: "r305", userId: "a", at: new Date("2026-11-16T10:00:00Z") },
      { roomId: "r305", userId: "sup", at: new Date("2026-11-16T12:00:00Z") }, // keine Housekeeperin
      { roomId: "r305", userId: "b", at: new Date("2026-11-17T09:00:00Z") }, // heute — zählt nicht
    ], before, hks);
    expect(m.get("r305")).toBe("a");
  });
  it("ohne Reinigung im Aufenthalt kein Vorschlag", () => {
    expect(lastCleanerByStay([{ roomId: "r305", stayId: "s1", checkIn }], [], before, hks).size).toBe(0);
  });
  it("der Vorschlag gibt den Bleiber an dieselbe Kraft, Begründung ohne Gastdaten — überschreibbar", () => {
    const rooms = [room("r101", { stayHk: "b" }), room("r102")];
    const input = makeInput(rooms, [hk("a", "VOLLZEIT", 2), hk("b", "VOLLZEIT", 2)]);
    const res = propose(input);
    expect(res.assignment.r101).toBe("b");
    expect(res.reasons.r101.join(" ")).toContain("Gleicher Aufenthalt");
    const manual = buildResult(input, { r101: "a", r102: "b" }); // Hand-Zuteilung bleibt möglich
    expect(manual.assignment.r101).toBe("a");
    expect(manual.cost.parts.stayContinuity).toBeGreaterThan(0);
  });
});
