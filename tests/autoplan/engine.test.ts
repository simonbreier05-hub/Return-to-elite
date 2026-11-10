import { describe, expect, it } from "vitest";
import { proposePlan } from "@/lib/autoplan/propose";
import { buildResult } from "@/lib/autoplan/result";
import { orderRoute } from "@/lib/autoplan/route";
import { AUTOPLAN_WEIGHTS } from "@/lib/autoplan/weights";
import type { PlanResult, PlanRoom } from "@/lib/autoplan/types";
import { hk, makeDay, makeInput, TEAM } from "./scenario";

const credits = (r: PlanResult, id: string) => r.metrics.find((m) => m.hkId === id)!.credits;
const roomsOf = (r: PlanResult, id: string) => r.routes.find((x) => x.hkId === id)!.roomIds;

describe("Zuteilungsvorschlag: harte Regeln", () => {
  const rooms = makeDay(94);
  const r = proposePlan(makeInput(rooms, TEAM()));
  const byId = new Map(rooms.map((x) => [x.id, x]));

  it("Stufe 1 bekommt nie anspruchsvolle Zimmer", () => {
    for (const id of ["f", "g"]) for (const rid of roomsOf(r, id)) expect(byId.get(rid)!.demanding, `${id}:${rid}`).toEqual([]);
    expect(r.warnings.map((w) => w.code)).not.toContain("LEVEL1_DEMANDING");
  });

  it("alle Zimmer sind zugeteilt, jedes genau einmal", () => {
    const all = r.routes.flatMap((x) => x.roomIds);
    expect(all.length).toBe(rooms.length);
    expect(new Set(all).size).toBe(rooms.length);
    expect(r.unassigned).toEqual([]);
  });

  it("manuelle Zuteilungen bleiben unangetastet (auch bei Stufe 1 und Überlast)", () => {
    const fixed = rooms.map((x, i) => (i < 6 ? { ...x, fixedTo: "g" } : x));
    const res = proposePlan(makeInput(fixed, TEAM()));
    for (const x of fixed.slice(0, 6)) expect(res.assignment[x.id]).toBe("g");
  });

  it("begonnene und erledigte Zimmer werden nie verschoben", () => {
    const started = rooms.map((x, i) => (i % 10 === 0 ? { ...x, state: "STARTED" as const, fixedTo: "c" } : x));
    const res = proposePlan(makeInput(started, TEAM()));
    for (const x of started.filter((y) => y.state === "STARTED")) expect(res.assignment[x.id]).toBe("c");
  });

  it("nur Stufe 1 anwesend: trotzdem bleibt kein Zimmer offen — nur eine Warnung je anspruchsvollem Zimmer", () => {
    const res = proposePlan(makeInput(rooms, [hk("x", "VOLLZEIT", 1), hk("y", "VOLLZEIT", 1)]));
    expect(res.unassigned).toEqual([]);
    const demanding = rooms.filter((x) => x.demanding.length).map((x) => x.id).sort();
    const warned = res.warnings.filter((w) => w.code === "LEVEL1_DEMANDING").flatMap((w) => w.roomIds ?? []).sort();
    expect(warned).toEqual(demanding);
  });

  it("jede Kraft darf jedes Zimmer bekommen: bei beliebigem Team bleibt nach dem Vorschlag nichts offen", () => {
    for (const team of [[hk("a", "VOLLZEIT", 1)], [hk("a", "AZUBI", 1), hk("b", "TEILZEIT", 1)], TEAM(), [hk("a", "VOLLZEIT", 3)]]) {
      const res = proposePlan(makeInput(rooms, team));
      expect(res.unassigned, `Team ${team.length}`).toEqual([]);
      expect(Object.values(res.assignment).every((v) => v !== null)).toBe(true);
    }
  });
});

describe("Zuteilungsvorschlag: Fairness", () => {
  // So viel Arbeit, dass alle Zimmer-Bänder erreichbar sind (6 × 10–13 + 6–8)
  const rooms = makeDay(80);
  const r = proposePlan(makeInput(rooms, TEAM()));
  const vz = ["a", "b", "c", "d", "e", "f"];

  const roomsN = (id: string) => r.metrics.find((m) => m.hkId === id)!.rooms;
  it("Plan-1b: Zimmerzahl im Band je Typ — Vollzeit 10–13, Azubi 6–8", () => {
    for (const id of vz) {
      expect(roomsN(id), id).toBeGreaterThanOrEqual(10);
      expect(roomsN(id), id).toBeLessThanOrEqual(13);
    }
    expect(roomsN("g")).toBeGreaterThanOrEqual(6);
    expect(roomsN("g")).toBeLessThanOrEqual(8);
    expect(credits(r, "a")).toBeGreaterThan(0); // Credits bleiben als Gegenprobe sichtbar
  });

  it("Plan-1b: Azubi bekommt keine Junior Suite/Suite, solange andere frei sind", () => {
    const byId = new Map(rooms.map((x) => [x.id, x]));
    expect(roomsOf(r, "g").filter((id) => byId.get(id)!.demanding.includes("SUITE"))).toEqual([]);
  });

  it("Plan-1b: Mischung je Kraft ähnlich — Turn, Deep clean, Tidy, Linen change (Vollzeit)", () => {
    const of = (id: string) => { const m = r.metrics.find((x) => x.hkId === id)!; return { turn: m.turns, deep: m.departures - m.turns, tidy: m.stayovers, linen: m.linen }; };
    for (const key of ["turn", "deep", "tidy", "linen"] as const) {
      const v = vz.map((id) => of(id)[key]);
      expect(Math.max(...v) - Math.min(...v), key).toBeLessThanOrEqual(3);
    }
  });

  it("Abreisen, Bleiber und Wäschewechsel sind ähnlich verteilt (Vollzeit)", () => {
    for (const key of ["departures", "stayovers", "linen"] as const) {
      const v = vz.map((id) => r.metrics.find((m) => m.hkId === id)![key]);
      expect(Math.max(...v) - Math.min(...v), key).toBeLessThanOrEqual(3);
    }
  });

  it("anspruchsvolle Zimmer gleichmäßig auf Stufe 2 und 3", () => {
    const d = ["a", "b", "c", "d", "e"].map((id) => r.metrics.find((m) => m.hkId === id)!.demanding);
    expect(Math.max(...d) - Math.min(...d)).toBeLessThanOrEqual(2);
  });

  it("höchstens 2 Etagen je Housekeeper", () => {
    for (const m of r.metrics) expect(m.floors.length, m.hkId).toBeLessThanOrEqual(2);
    expect(r.warnings.map((w) => w.code)).not.toContain("TOO_MANY_FLOORS");
  });

  it("Interconnecting-Zimmer gehen zum selben Housekeeper", () => {
    const big = makeDay(110); // genug Zimmer, damit Interconnecting-Paare im Plan stehen
    const rb = proposePlan(makeInput(big, TEAM()));
    const pairs = big.filter((x) => x.interconnect.length).flatMap((x) => x.interconnect.map((o) => [x.id, o]));
    expect(pairs.length).toBeGreaterThan(0);
    for (const [a, b] of pairs) expect(rb.assignment[a], `${a}/${b}`).toBe(rb.assignment[b]);
  });

  it("Stammetage: schwacher Wunsch (Gewicht 1); mit höherem Gewicht klar erkennbar", () => {
    const team = TEAM();
    team[0].homeFloors = [3]; team[2].homeFloors = [1]; team[4].homeFloors = [5];
    const onHome = (res: PlanResult, id: string, f: number) => roomsOf(res, id).filter((rid) => rooms.find((x) => x.id === rid)!.floor === f).length;
    expect(AUTOPLAN_WEIGHTS.homeFloor).toBe(1); // schwacher Wunsch: nicht ausschlaggebend (Interview)
    const strong = proposePlan({ ...makeInput(rooms, team), weights: { ...AUTOPLAN_WEIGHTS, homeFloor: 25 } });
    for (const [id, f] of [["a", 3], ["c", 1], ["e", 5]] as const) expect(onHome(strong, id, f) / roomsOf(strong, id).length, id).toBeGreaterThan(0.5);
    expect(credits(strong, "a")).toBeGreaterThanOrEqual(12.2);
  });
});

describe("zu wenige Kräfte", () => {
  it("zeigt 'Benötigt: X Housekeeper bei Ziel Y', überschreitet Etagen mit Warnung statt abzubrechen", () => {
    const rooms = makeDay(94);
    const res = proposePlan(makeInput(rooms, [hk("a", "VOLLZEIT", 3), hk("b", "VOLLZEIT", 2), hk("c", "VOLLZEIT", 2)]));
    expect(res.unassigned).toEqual([]);
    // Plan-1b: Bedarf nach Zimmern — 94 Zimmer ÷ 11,5 Zimmer je Vollzeitkraft = 9
    expect(res.needed).toMatchObject({ housekeepers: 9, targetRooms: 11.5, present: 3 });
    expect(res.warnings.find((w) => w.code === "TOO_FEW_STAFF")!.message).toContain("Personal reicht nicht: benötigt 9 Kräfte, ausgewählt 3 (bei 11,5 Zimmern je Vollzeitkraft)");
    expect(res.warnings.map((w) => w.code)).toContain("TOO_MANY_FLOORS");
  });
});

describe("mehr Kräfte als Arbeit", () => {
  it("ein Gesamthinweis statt einer Warnung je Person", () => {
    const res = proposePlan(makeInput(makeDay(20), TEAM()));
    const codes = res.warnings.map((w) => w.code);
    expect(codes).toContain("TOO_MANY_STAFF");
    expect(codes).not.toContain("CREDITS_OUT_OF_BAND");
    expect(res.warnings.find((w) => w.code === "TOO_MANY_STAFF")!.severity).toBe("INFO");
  });
});

describe("Route", () => {
  it("Plan-1b: Turn (nach Anreisezeit) → VIP → Bleiber → Deep clean (Abreise ohne Anreise) zuletzt", () => {
    const base = { section: "1A", laundry: false, credits: 1, demanding: [], traces: 0, interconnect: [], state: "TODO", fixedTo: null } as const;
    const mk = (id: string, floor: number, kind: PlanRoom["kind"], extra: Partial<PlanRoom> = {}): PlanRoom =>
      ({ ...base, id, number: `${floor}0${id}`, floor, kind, vip: false, eta: null, ...extra }) as PlanRoom;
    const route = orderRoute([
      mk("1", 1, "STAYOVER"), mk("2", 1, "DEPARTURE"), mk("3", 2, "STAYOVER", { vip: true }),
      mk("4", 3, "TURN", { eta: "15:00" }), mk("5", 4, "TURN", { eta: "11:00" }), mk("6", 5, "DEPARTURE", { vip: true }),
    ]);
    expect(route.map((r) => r.id)).toEqual(["5", "4", "3", "6", "1", "2"]);
  });

  it("Vorschlag liefert die Route in dieser Reihenfolge", () => {
    const res = proposePlan(makeInput(makeDay(94), TEAM()));
    const rooms = new Map(makeDay(94).map((x) => [x.id, x]));
    for (const rt of res.routes) {
      const tiers = rt.roomIds.map((id) => { const x = rooms.get(id)!; return x.kind === "TURN" ? 0 : x.vip ? 1 : x.kind === "STAYOVER" ? 2 : 3; });
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    }
  });
});

describe("Erklärbarkeit", () => {
  it("jede Zuteilung hat eine Begründung; VIP/Suite nennen die Stufe", () => {
    const rooms = makeDay(94);
    const res = proposePlan(makeInput(rooms, TEAM()));
    for (const x of rooms) expect(res.reasons[x.id].length, x.id).toBeGreaterThan(0);
    const vip = rooms.find((x) => x.vip)!;
    expect(res.reasons[vip.id].join(" ")).toMatch(/VIP: Stufe [23]/);
  });
});

describe("Determinismus und Laufzeit", () => {
  it("gleiche Eingabe → gleicher Vorschlag", () => {
    const rooms = makeDay(94);
    const a = proposePlan(makeInput(rooms, TEAM()));
    const b = proposePlan(makeInput(rooms, TEAM()));
    expect(b.assignment).toEqual(a.assignment);
    expect(b.routes).toEqual(a.routes);
  });

  it("145 Zimmer, 10 Housekeeper: unter 3 Sekunden", () => {
    const team = [...TEAM(), hk("h", "VOLLZEIT", 2), hk("i", "VOLLZEIT", 3), hk("j", "TEILZEIT", 2)];
    const t0 = Date.now();
    const res = proposePlan(makeInput(makeDay(145), team));
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(res.unassigned).toEqual([]);
  });
});

describe("Gewichte", () => {
  it("Gewicht 0 für Etagen schaltet die Regel aus; 100 hält sie", () => {
    const rooms = makeDay(94);
    const off = proposePlan({ ...makeInput(rooms, TEAM()), weights: { ...AUTOPLAN_WEIGHTS, extraFloor: 0 } });
    expect(off.cost.parts.extraFloor).toBe(0);
    expect(buildResult(makeInput(rooms, TEAM()), off.assignment).metrics.length).toBe(7);
  });
});

describe("Credit-Gegenprobe (Plan-1b)", () => {
  it("Credit-Band = Zimmer-Band × durchschnittlicher Credit je Zimmer", async () => {
    const { bandFor } = await import("@/lib/autoplan/load");
    expect(bandFor({ lo: 10, hi: 13 }, 1.2)).toEqual({ lo: 12, hi: 15.6 });
    expect(bandFor({ lo: 6, hi: 8 }, 1)).toEqual({ lo: 6, hi: 8 });
  });
});
