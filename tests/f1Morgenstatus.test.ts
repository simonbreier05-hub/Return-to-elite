import { describe, expect, it } from "vitest";
import { planBoardStatus } from "@/lib/dayplan/boardStatus";
import { computeDayNumbers, numbersConsistent, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { listTier, LIST_TIER } from "@/lib/planung/listOrder";
import { kindPill } from "@/lib/ui/hkHub";
import { LABEL_ORDER } from "@/lib/lists/rowLabels";

/** F1 (Befunde K1, K3): Morgenstatus „Rest vom Vortag“ und Zimmer ohne Tagesplan-Eintrag. */
const dayStart = new Date("2026-11-19T00:00:00+01:00");
const yesterday = new Date("2026-11-18T15:00:00+01:00");
const room = (id: string, status: string, since = yesterday) => ({ id, status, statusSince: since });

describe("Morgenstatus", () => {
  it("nicht fertig → DIRTY, gereinigt-ungeprüft → CLEAN, fertig → INSPECTED; Rest vom Vortag wird gemeldet", () => {
    const rooms = ["DIRTY", "IN_PROGRESS", "PICKUP", "BLOCKED", "DEFECT_REPORTED", "CLEAN", "INSPECTED"].map((s) => room(s, s));
    const { updates, carryover } = planBoardStatus({ rooms, needsCleaning: new Set(), marker: {}, dayStart });
    expect(updates).toEqual([
      { id: "IN_PROGRESS", status: "DIRTY" }, { id: "PICKUP", status: "DIRTY" }, { id: "BLOCKED", status: "DIRTY" }, { id: "DEFECT_REPORTED", status: "DIRTY" },
    ]);
    expect(carryover).toEqual(["DIRTY", "IN_PROGRESS", "PICKUP", "BLOCKED", "DEFECT_REPORTED", "CLEAN"]);
  });

  it("heute vom Hub schmutzig gesetzt (Abreise fiel im Nachimport weg) ist kein Rest vom Vortag", () => {
    const set = new Date("2026-11-19T05:30:00+01:00");
    const { updates, carryover } = planBoardStatus({ rooms: [room("r1", "DIRTY", set)], needsCleaning: new Set(), marker: { r1: ["DIRTY", set.toISOString()] }, dayStart });
    expect(updates).toEqual([{ id: "r1", status: "INSPECTED" }]);
    expect(carryover).toEqual([]);
  });

  it("Anreise in ein gestern nicht gereinigtes Zimmer: schmutzig statt „Prüfung offen“", () => {
    const { updates } = planBoardStatus({ rooms: [room("a", "DIRTY")], needsCleaning: new Set(), needsCheck: new Set(["a"]), marker: {}, dayStart });
    expect(updates).toEqual([]); // bleibt DIRTY (unverändert)
  });

  it("Abreise heute bleibt Abreise (kein Rest vom Vortag)", () => {
    const { carryover } = planBoardStatus({ rooms: [room("d", "DIRTY")], needsCleaning: new Set(["d"]), marker: {}, dayStart });
    expect(carryover).toEqual([]);
  });
});

describe("Tageszahlen mit Rest vom Vortag und Zusatz-Zimmern", () => {
  const row = (over: Partial<DayNumberRow>): DayNumberRow => ({
    id: Math.random().toString(36), number: "1", floor: 1, kind: "DEPARTURE", laundryDue: false, nightsKnown: false, status: "DIRTY", occupied: false, assignedToId: null, assignedToday: false, ...over,
  });
  it("Rest vom Vortag zählt, solange nicht fertig; gereinigt-ungeprüft nicht als zu reinigen", () => {
    const n = computeDayNumbers({ rows: [row({ kind: "CARRYOVER" }), row({ kind: "CARRYOVER", status: "CLEAN" })], inventory: 10 });
    expect(n.toClean).toBe(1);
    expect(n.byKind.CARRYOVER).toBe(1);
    expect(n.occupied).toBe(0); // nicht belegt, solange das Board nichts anderes sagt
    expect(numbersConsistent(n)).toBe(true);
  });
  it("ohne Art und nicht zugeteilt zählt nicht; zugeteilt (heute) zählt als Zusatz", () => {
    expect(computeDayNumbers({ rows: [row({ kind: null as never })], inventory: 10 }).toClean).toBe(0);
    const n = computeDayNumbers({ rows: [row({ kind: null as never, assignedToId: "hk", assignedToday: true })], inventory: 10 });
    expect([n.toClean, n.assigned, n.byKind.EXTRA]).toEqual([1, 1, 1]);
  });
});

describe("Anzeige", () => {
  it("Rest vom Vortag steht in der Housekeeper-Liste oben (wie Turn, nicht hinter den Bleibern) und in „nach Art“ zuerst", () => {
    const base = { rush: false, serviceNow: false, cleanAfter: null, checkedOut: false };
    expect(listTier({ ...base, kind: "CARRYOVER" }, "09:00")).toBe(LIST_TIER.TURN);
    expect(listTier({ ...base, kind: "CARRYOVER" }, "09:00")).toBeLessThan(listTier({ ...base, kind: "STAYOVER" }, "09:00"));
    expect(LABEL_ORDER[0]).toBe("CARRYOVER");
  });
  it("Pillen mit Text: „Seit gestern offen“ und „Zusätzlich“", () => {
    expect(kindPill("CARRYOVER")?.labelKey).toBe("lists.kindCARRYOVER");
    expect(kindPill("EXTRA")?.labelKey).toBe("lists.kindEXTRA");
  });
});
