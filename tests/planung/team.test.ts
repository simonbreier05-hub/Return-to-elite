import { describe, expect, it } from "vitest";
import {
  capacityVerdict, floorsBySupervisor, floorsMissing, nextSupervisor, phaseStates, pickDefaultTeam, planCounts, teamMissing,
} from "@/lib/planung/team";
import { supervisorBadges } from "@/lib/planung/model";

describe("Bedarf gegen Besetzung", () => {
  it("reicht, wenn die Tagesziele den Bedarf decken", () => {
    expect(capacityVerdict(80, [20, 20, 20, 20])).toMatchObject({ ok: true, missing: 0, have: 80 });
  });
  it("zu knapp: nennt, wie viel fehlt", () => {
    expect(capacityVerdict(80.4, [20, 20, 20])).toMatchObject({ ok: false, missing: 20.4, have: 60 });
  });
  it("ohne Gewählte: Besetzung 0", () => {
    expect(capacityVerdict(10, [])).toMatchObject({ ok: false, have: 0, missing: 10 });
  });
});

describe("Weiter gesperrt/frei", () => {
  it("Team: braucht Housekeeper und Supervisor", () => {
    expect(teamMissing({ hk: 0, sup: 0 })).toEqual(["HK", "SUP"]);
    expect(teamMissing({ hk: 3, sup: 0 })).toEqual(["SUP"]);
    expect(teamMissing({ hk: 0, sup: 1 })).toEqual(["HK"]);
    expect(teamMissing({ hk: 1, sup: 1 })).toEqual([]);
  });
  it("Etagen: nennt die offenen Etagen, frei erst wenn alle fünf besetzt sind", () => {
    expect(floorsMissing({ 1: "a", 2: null, 3: "b" })).toEqual([2, 4, 5]);
    expect(floorsMissing({ 1: "a", 2: "a", 3: "b", 4: "b", 5: "a" })).toEqual([]);
  });
  it("Antippen wechselt reihum, auch über das Ende hinaus", () => {
    expect(nextSupervisor(null, ["a", "b", "c"])).toBe("a");
    expect(nextSupervisor("a", ["a", "b", "c"])).toBe("b");
    expect(nextSupervisor("c", ["a", "b", "c"])).toBe("a");
    expect(nextSupervisor("x", ["a", "b"])).toBe("a");
    expect(nextSupervisor(null, [])).toBeNull();
  });
});

describe("Vorbelegung des Teams", () => {
  const avail = { hk: ["h1", "h2", "h3"], sup: ["s1", "s2"], hm: ["m1"], absentToday: ["h3"] };
  it("ohne Speicherstand: alle aktiven, Abwesende nicht", () => {
    const r = pickDefaultTeam("2026-09-22", null, avail);
    expect(r.source).toBe("default");
    expect(r.selected).toEqual({ hk: ["h1", "h2"], sup: ["s1", "s2"], hm: ["m1"] });
  });
  it("Auswahl vom Vortag, nur noch vorhandene und nicht abwesende", () => {
    const r = pickDefaultTeam("2026-09-22", { date: "2026-09-21", hk: ["h1", "h3", "gone"], sup: ["s2"], hm: [] }, avail);
    expect(r.source).toBe("previous");
    expect(r.selected).toEqual({ hk: ["h1"], sup: ["s2"], hm: [] });
  });
  it("heute schon gespeichert: genau diese Auswahl", () => {
    const r = pickDefaultTeam("2026-09-22", { date: "2026-09-22", hk: ["h3"], sup: ["s1"], hm: ["m1"] }, avail);
    expect(r.source).toBe("today");
    expect(r.selected.hk).toEqual(["h3"]);
  });
});

describe("Supervisor-Badges", () => {
  it("Buchstabe + drei Helligkeitsstufen nach alphabetischer Reihenfolge, Kollisionen über den Nachnamen", () => {
    const b = supervisorBadges([{ id: "1", name: "Petra Z" }, { id: "2", name: "Jonas A" }, { id: "3", name: "Paul Q" }, { id: "4", name: "Carla B" }]);
    expect(b["4"]).toMatchObject({ letter: "C", tone: 1 });
    expect(b["2"]).toMatchObject({ letter: "J", tone: 2 });
    expect(b["3"]).toMatchObject({ letter: "P", tone: 3 });
    expect(b["1"].letter).toBe("Z"); // „P" ist schon vergeben
    expect(new Set(Object.values(b).map((x) => x.letter)).size).toBe(4);
  });
});

describe("Plan-Ergebnis", () => {
  it("zählt Listen: Housekeeper mit Zimmern, Supervisoren mit Etage, gewählte Hausmänner", () => {
    const c = planCounts([{ roomIds: ["a"] }, { roomIds: [] }, { roomIds: ["b", "c"] }], { 1: "s1", 2: "s1", 3: "s2", 4: "s2", 5: "s2" }, 2);
    expect(c).toEqual({ roomLists: 2, supervisorLists: 2, hausmannLists: 2 });
    expect(floorsBySupervisor({ 1: "s1", 2: "s1", 3: "s2" })).toEqual({ s1: [1, 2], s2: [3] });
  });
  it("Phasen folgen dem echten Fortschritt, nicht einem Timer", () => {
    expect(phaseStates(0, true, null).merge).toBe("running");
    const s = phaseStates(2, true, null);
    expect([s.merge, s.propose, s.rooms, s.supervisors]).toEqual(["done", "done", "running", "waiting"]);
    const e = phaseStates(1, true, "propose");
    expect([e.merge, e.propose, e.rooms]).toEqual(["done", "error", "waiting"]);
    expect(Object.values(phaseStates(5, false, null)).every((x) => x === "done")).toBe(true);
  });
});
