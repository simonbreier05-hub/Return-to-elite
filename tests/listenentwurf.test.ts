import { describe, expect, it } from "vitest";
import { computeDayNumbers, numbersConsistent, type DayKind, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { distributeHouseman } from "@/lib/planung/housemanAssign";
import { readFileSync } from "node:fs";

const row = (i: number, o: Partial<DayNumberRow> = {}): DayNumberRow => ({
  id: `r${i}`, number: String(100 + i), kind: "STAYOVER", laundryDue: false, nightsKnown: true, status: "DIRTY", occupied: true, assignedToId: null, assignedToday: false, ...o,
});

describe("Zahlen: eine Quelle, ein Modell", () => {
  it("Invariante gereinigt ≤ zugeteilt ≤ zu reinigen ≤ belegt ≤ Inventar — auch bei zufälligen Tagen", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const kinds: DayKind[] = ["DEPARTURE", "TURN", "STAYOVER", "ARRIVAL"];
    const statuses = ["DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED", "BLOCKED", "OUT_OF_ORDER", "OUT_OF_SERVICE", "GREEN_OPT_OUT", "PICKUP"];
    for (let round = 0; round < 200; round++) {
      const rows = Array.from({ length: 145 }, (_, i) => row(i, {
        kind: kinds[rnd(4)], status: statuses[rnd(statuses.length)], occupied: rnd(3) > 0,
        assignedToId: rnd(2) ? `hk${rnd(6)}` : null, assignedToday: rnd(4) > 0, laundryDue: rnd(3) === 0,
      }));
      const n = computeDayNumbers({ rows, inventory: 145 });
      expect(n.cleaned).toBeLessThanOrEqual(n.assigned);
      expect(n.assigned).toBeLessThanOrEqual(n.toClean);
      expect(n.toClean).toBeLessThanOrEqual(n.occupied);
      expect(n.occupied).toBeLessThanOrEqual(145);
      expect(n.open).toBe(n.toClean - n.assigned);
      expect(numbersConsistent(n)).toBe(true);
    }
  });

  it("alle belegten Zimmer sind in der Planmenge — 113 belegt, nur 35 offen/zugeteilt war der Fehler", () => {
    // 113 Zimmer mit Service (Abreise/Turn/Bleiber), davon 78 schon „fertig" ohne Zuteilung (Demo-Altlast) und 35 schmutzig
    const rows = [
      ...Array.from({ length: 78 }, (_, i) => row(i, { status: i % 2 ? "CLEAN" : "INSPECTED" })),
      ...Array.from({ length: 35 }, (_, i) => row(100 + i, { kind: i % 5 === 0 ? "DEPARTURE" : "STAYOVER", assignedToId: "hk1", assignedToday: true })),
    ];
    const n = computeDayNumbers({ rows, inventory: 145 });
    expect(n.occupied).toBe(113);
    expect(n.toClean).toBe(113); // nichts wird still weggelassen
    expect(n.assigned).toBe(113); // fertig zählt als zugeteilt
    expect(n.cleaned).toBe(78);
    expect(n.open).toBe(0);
  });

  it("offene Zimmer erscheinen mit Zahl und Ids; Nicht-Gereinigtes mit Grund", () => {
    const rows = [row(1), row(2, { assignedToId: "a", assignedToday: true }), row(3, { status: "OUT_OF_ORDER" }), row(4, { status: "GREEN_OPT_OUT" }), row(5, { status: "OUT_OF_SERVICE" })];
    const n = computeDayNumbers({ rows, inventory: 145 });
    expect(n).toMatchObject({ toClean: 2, assigned: 1, open: 1, openIds: ["r1"], occupied: 5 });
    expect(n.notCleaned).toMatchObject({ total: 3, byReason: { outOfOrder: 1, outOfService: 1, optOut: 1 } });
  });

  it("gestrige Zuteilung zählt nicht (assignedToday false); Zuteilung außerhalb der gewählten Kräfte wird gemeldet", () => {
    const rows = [row(1, { assignedToId: "a", assignedToday: false }), row(2, { assignedToId: "x", assignedToday: true }), row(3, { assignedToId: "a", assignedToday: true })];
    const n = computeDayNumbers({ rows, inventory: 145, team: ["a", "b"] });
    expect(n.assigned).toBe(2);
    expect(n.outsideTeam).toBe(1);
  });

  it("fertig ohne Zuteilung ist eine eigene Zahl und bleibt Teilmenge von zugeteilt", () => {
    const rows = [row(1, { status: "CLEAN" }), row(2, { status: "CLEAN", assignedToId: "a", assignedToday: true }), row(3, { status: "INSPECTED", assignedToId: "a", assignedToday: false }), row(4)];
    const n = computeDayNumbers({ rows, inventory: 145 });
    expect(n).toMatchObject({ assigned: 3, cleaned: 3, open: 1, doneUnassigned: 2 });
    expect(n.doneUnassigned).toBeLessThanOrEqual(n.assigned);
  });

  it("Wäschewechsel: nur mit Datengrundlage (Anreisedatum bekannt); sonst keine Kachel — nie geschätzt", () => {
    expect(computeDayNumbers({ rows: [row(1, { nightsKnown: false, laundryDue: true }), row(2, { kind: "DEPARTURE" })], inventory: 145 }).laundryDue).toBeNull();
    const n = computeDayNumbers({ rows: [row(1, { laundryDue: true }), row(2), row(3, { laundryDue: true, kind: "DEPARTURE" })], inventory: 145 });
    expect(n.laundryDue).toEqual({ count: 1, ids: ["r1"] }); // nur Bleiber; Abreisen sind ohnehin Vollreinigung
  });
});

describe("Hausmann-Traces", () => {
  const items = [1, 1, 2, 2, 2, 3, 4, 5].map((floor, i) => ({ id: `t${i}`, floor, assignedToId: null as string | null }));
  it("ein Hausmann bekommt alle", () => {
    const out = distributeHouseman(items, ["h1"]);
    expect(Object.keys(out)).toHaveLength(items.length);
    expect(new Set(Object.values(out))).toEqual(new Set(["h1"]));
  });
  it("mehrere: gleichmäßig nach Etage (eine Etage bleibt bei einem Hausmann), nie ein anderer als die Gewählten", () => {
    const out = distributeHouseman(items, ["h1", "h2"]);
    for (const f of [1, 2, 3, 4, 5]) expect(new Set(items.filter((i) => i.floor === f).map((i) => out[i.id])).size).toBe(1);
    const load = (h: string) => Object.values(out).filter((x) => x === h).length;
    expect(Math.abs(load("h1") - load("h2"))).toBeLessThanOrEqual(2);
    expect(Object.values(out).every((x) => x === "h1" || x === "h2")).toBe(true);
  });
  it("Handwahl und bestehende Zuteilung an Gewählte bleiben; Zuteilung an Nicht-Gewählte wird neu verteilt", () => {
    const withOld = items.map((i) => (i.id === "t0" ? { ...i, assignedToId: "other" } : i.id === "t1" ? { ...i, assignedToId: "h2" } : i));
    const out = distributeHouseman(withOld, ["h1", "h2"], { t7: "h2" });
    expect(out.t1).toBe("h2");
    expect(out.t7).toBe("h2");
    expect(["h1", "h2"]).toContain(out.t0);
  });
  it("niemand gewählt → nichts wird zugeteilt", () => expect(distributeHouseman(items, [])).toEqual({}));
});

describe("Kein Neuladen nach einer Zuteilung", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("Zuteil-Oberflächen navigieren nie und bauen sich nicht neu auf (kein router.*, location, reload, key-Wechsel)", () => {
    for (const f of ["src/components/DragDropBoard.tsx", "src/components/PlanningFloorPlanPanel.tsx", "src/components/AssignmentFloorPlan.tsx", "src/components/planung/PlanEditorWindow.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/router\.(push|replace|refresh)|location\.(reload|assign|href\s*=)|window\.location/);
      expect(src, f).not.toMatch(/<PlanningFloorPlanPanel[^>]*\bkey=/);
    }
  });
  it("Aktualisierung läuft über reloadToken im Hintergrund", () => {
    expect(read("src/components/AssignmentFloorPlan.tsx")).toContain("reloadToken={version}");
    expect(read("src/components/PlanningFloorPlanPanel.tsx")).toMatch(/reloadToken/);
  });
  it("Wäschewechsel-Kachel nutzt nie eine Schätzung auf dem Client", () => {
    expect(read("src/components/PlanningFloorPlanPanel.tsx")).not.toContain("isLaundryDue");
  });
});
