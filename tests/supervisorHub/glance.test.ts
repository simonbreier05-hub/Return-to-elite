import { describe, expect, it } from "vitest";
import { dailyProgress, dndBlockedSummary, glanceKpis, type GlanceRoom } from "@/lib/dayplan/glance";
import { computeDayNumbers, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { dayTileRows, floorBreakdown } from "@/lib/dayplan/glanceDetails";

const room = (number: string, floor: number, status: string, extra: Partial<GlanceRoom> = {}): GlanceRoom =>
  ({ id: `r${number}`, number, floor, status, isCheckoutToday: false, arrivals: [], ...extra });

const rooms: GlanceRoom[] = [
  room("201", 2, "INSPECTED"),
  room("202", 2, "BLOCKED", { blockReason: "DND" }),
  room("203", 2, "BLOCKED", { blockReason: "GUEST_IN_ROOM", isCheckoutToday: true }),
  room("204", 2, "DIRTY", { guestDndActive: true, arrivals: [{}] }),
  room("301", 3, "INSPECTED"),
  room("302", 3, "BLOCKED", { blockReason: "DND", guestDndActive: true }),
  room("303", 3, "OUT_OF_ORDER"),
  room("304", 3, "BLOCKED"),
];

describe("Kennzahlen: Etagenfilter", () => {
  it("ohne Etagen = ganzes Haus", () => {
    const k = glanceKpis({ rooms, workOrders: [], roomTasks: [] });
    expect(k.departures).toBe(1);
    expect(k.dnd).toBe(2); // vom Personal gemeldetes DND
    expect(k.dndBlocked).toEqual({ dnd: 3, blocked: 2 });
    expect(k.progress).toEqual({ inspected: 2, sellable: 7, percent: 29 });
  });
  it("mit Etagen nur diese Etagen — auch Aufträge und Hausmann-Aufgaben", () => {
    const k = glanceKpis({
      rooms, floors: [3],
      workOrders: [{ status: "OPEN", floor: 3 }, { status: "OPEN", floor: 2 }, { status: "RESOLVED", floor: 3 }, { status: "OPEN", floor: null }],
      roomTasks: [{ status: "OPEN", floor: 2 }, { status: "OPEN", floor: 3 }, { status: "DONE", floor: 3 }],
    });
    expect(k.arrivals).toBe(0);
    expect(k.departures).toBe(0);
    expect(k.openDefects).toBe(1);
    expect(k.openHouseTasks).toBe(1);
    expect(k.dndBlocked).toEqual({ dnd: 1, blocked: 1 });
    expect(k.progress).toEqual({ inspected: 1, sellable: 3, percent: 33 });
  });
  it("Tagesfortschritt: dieselbe Rechnung wie die alte Kachel (freigegeben / verkaufbar), 0 % ohne verkaufbare Zimmer", () => {
    expect(dailyProgress([{ status: "OUT_OF_SERVICE" }])).toEqual({ inspected: 0, sellable: 0, percent: 0 });
    expect(dailyProgress([{ status: "INSPECTED" }, { status: "CLEAN" }, { status: "OUT_OF_ORDER" }]).percent).toBe(50);
  });
});

describe("DND/Blockiert-Zusammenfassung", () => {
  const s = dndBlockedSummary(rooms);
  it("DND = Gastwunsch oder BLOCKED/DND, mit Quelle; nie doppelt bei blockiert", () => {
    expect(s.dnd.map((r) => [r.number, r.source])).toEqual([["202", "STAFF"], ["204", "GUEST"], ["302", "BOTH"]]);
    expect(s.blocked.map((r) => [r.number, r.reason])).toEqual([["203", "GUEST_IN_ROOM"], ["304", null]]);
    const dndIds = new Set(s.dnd.map((r) => r.id));
    expect(s.blocked.some((r) => dndIds.has(r.id))).toBe(false);
  });
  it("Etagenfilter", () => {
    const f = dndBlockedSummary(rooms, [2]);
    expect(f.dnd.every((r) => r.floor === 2)).toBe(true);
    expect(f.blocked.map((r) => r.number)).toEqual(["203"]);
    expect(dndBlockedSummary(rooms, [9])).toEqual({ dnd: [], blocked: [] });
  });
  it("unvollständige Daten stürzen nicht ab", () => {
    expect(() => dndBlockedSummary([{ floor: 2, status: "BLOCKED", isCheckoutToday: false }])).not.toThrow();
  });
});

describe("Detail-Listen der Tageszahlen = dieselbe Menge wie die Zahl", () => {
  const row = (number: string, floor: number, kind: DayNumberRow["kind"], status: string, assignedToId: string | null = null): DayNumberRow =>
    ({ id: `d${number}`, number, floor, kind, status, laundryDue: false, nightsKnown: true, occupied: kind !== "DEPARTURE", assignedToId, assignedToday: !!assignedToId });
  const rows = [
    row("201", 2, "DEPARTURE", "DIRTY", "u1"), row("202", 2, "STAYOVER", "CLEAN", "u1"), row("203", 2, "ARRIVAL", "INSPECTED"),
    row("301", 3, "TURN", "DIRTY"), row("302", 3, "STAYOVER", "OUT_OF_ORDER"), row("303", 3, "ARRIVAL", "DIRTY"),
  ];
  const n = computeDayNumbers({ rows, inventory: 6 });
  it.each([["occupied", n.occupied], ["toClean", n.toClean], ["assigned", n.assigned], ["cleaned", n.cleaned], ["open", n.open], ["notCleaned", n.notCleaned.total], ["arrivalChecks", n.arrivalChecks.total]] as const)("%s", (key, count) => {
    expect(dayTileRows(key, rows, n)).toHaveLength(count);
  });
  it("Gesamtes Haus je Etage", () => {
    expect(floorBreakdown(rows)).toEqual([{ floor: 2, toClean: 2, cleaned: 1, open: 0 }, { floor: 3, toClean: 2, cleaned: 0, open: 2 }]);
  });
});
