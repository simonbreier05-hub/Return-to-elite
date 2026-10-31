/**
 * Zähllogik „belegt" / „zu reinigen" (Prüfung H0, 31.10.2026).
 *
 * Prüft nur bestehende Funktionen, ändert keine Logik:
 *  - deriveDayPlan().figures    → Import-Tagesplan-Kacheln („Zu reinigen", „Belegt heute Nacht")
 *  - floorStats()/houseTotals() → Planungstool /planung („belegt", „Abreisen", „Anreisen")
 *  - computeOccupancyCleanCounts → Duty Manager + Planungshub („N belegt, M davon gereinigt")
 *  - isHousekeepingRelevant     → /supervisor/planning („Zimmer zu reinigen")
 *  - creditFactor/isLaundryDue  → Credits und Wäschewechsel
 */
import { describe, expect, it } from "vitest";
import { deriveDayPlan } from "@/lib/dayplan/derive";
import type { ArrivalRow, DepartureRow } from "@/lib/import/types";
import { floorStats, houseTotals, type HouseFloor, type TileKind } from "@/lib/planung/model";
import { computeOccupancyCleanCounts } from "@/lib/rooms/occupancyCleanCount";
import { isHousekeepingRelevant } from "@/lib/rooms/isHousekeepingRelevant";
import { creditFactor } from "@/lib/rooms/stayoverCredit";
import { isLaundryDue } from "@/lib/rooms/laundryDue";
import { FLOOR_PLAN, HOTEL } from "@/lib/floorplan/hotelDeRome";
import { DEFAULT_SETTINGS } from "@/lib/domain";

const DATE = "2026-10-31";
const g = { salutation: "Mr.", title: null, lastName: "Test", fullName: "Test, X Mr." };
const dep = (room: string, arrDate: string, depDate: string, extra: Partial<DepartureRow> = {}): DepartureRow =>
  ({ room, guest: g, arrDate, depDate, adults: 1, children: 0, nights: 1, status: "CKIN", depTime: null, vip: false, ...extra });
const arr = (room: string, arrDate: string, depDate: string, extra: Partial<ArrivalRow> = {}): ArrivalRow =>
  ({ room, guest: g, arrDate, depDate, arrTime: "15:00", adults: 1, children: 0, status: "RESV", vip: false, traces: [], ...extra });

const KIND: Record<string, TileKind> = { DEPARTURE: "DEPARTURE", SAME_DAY_TURN: "TURN", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL" };

/** Wie getHouseData(): eine Kachel je digitalisiertem Zimmer, Art aus dem Tagesplan, sonst EMPTY. */
function houseFrom(plan: ReturnType<typeof deriveDayPlan>): HouseFloor[] {
  const byRoom = new Map(plan.rooms.map((r) => [r.room, r.cleaningType]));
  return HOTEL.floors.map((floor) => ({
    floor,
    tiles: FLOOR_PLAN[floor].map((e) => ({ number: e.number, kind: byRoom.has(e.number) ? KIND[byRoom.get(e.number)!] : "EMPTY" })),
  }));
}

/** Aufschlüsselung je Art aus den Kacheln (jedes Zimmer genau einmal). */
function breakdown(floors: HouseFloor[]) {
  const b = { DEPARTURE: 0, TURN: 0, STAYOVER: 0, ARRIVAL: 0, EMPTY: 0 } as Record<TileKind, number>;
  for (const f of floors) for (const t of f.tiles) b[t.kind]++;
  return b;
}

// Beispieltag mit allen Arten und Randfällen
const plan = deriveDayPlan({
  date: DATE,
  linenCycleDays: 3,
  lastLinenChange: { "203": "2026-10-30" },
  departures: [
    dep("101", "2026-10-29", DATE, { status: "DUOT" }), // Abreise
    dep("102", "2026-10-28", DATE, { status: "DUOT" }), // Turn (Abreise + Anreise)
    dep("201", "2026-10-28", "2026-11-03"), // Bleiber, seit 3 Tagen → Wäsche fällig
    dep("202", "2026-10-30", "2026-11-02"), // Bleiber, 1 Nacht → nicht fällig
    dep("203", "2026-10-20", "2026-11-05"), // Bleiber, Wäsche gestern gewechselt → nicht fällig
    dep("301", DATE, "2026-11-02", { status: "CKIN" }), // Frühanreise schon eingecheckt (steht in Departures)
    dep("999", "2026-10-29", "2026-11-02"), // nicht digitalisiertes Zimmer
  ],
  arrivals: [
    arr("102", DATE, "2026-11-04"),
    arr("104", DATE, "2026-11-01", { vip: true }), // reine Anreise
    arr("301", DATE, "2026-11-02", { status: "CKIN" }),
  ],
});

describe("Tagesplan-Zahlen (deriveDayPlan)", () => {
  it("jedes Zimmer hat genau eine Art — ein Turn erscheint nur einmal in der Zimmerliste", () => {
    const rooms = plan.rooms.map((r) => r.room);
    expect(new Set(rooms).size).toBe(rooms.length);
    expect(plan.rooms.find((r) => r.room === "102")?.cleaningType).toBe("SAME_DAY_TURN");
  });

  it("„Zu reinigen\" = Abreisen (inkl. Turns) + Bleiber; reine Anreisen zählen nicht", () => {
    const f = plan.figures;
    expect(f.departures).toBe(2); // 101 + Turn 102
    expect(f.stayovers).toBe(4); // 201, 202, 203, 999
    expect(f.arrivals).toBe(3); // Turn 102, 104, 301
    expect(f.cleaningCount).toBe(f.departures + f.stayovers);
    expect(f.cleaningCount).toBe(6);
    const types = plan.rooms.map((r) => r.cleaningType);
    expect(f.cleaningCount).toBe(types.filter((t) => t !== "ARRIVAL").length);
  });

  it("Turn zählt bei Abreisen und bei Anreisen, aber nur einmal bei „zu reinigen\"", () => {
    const turns = plan.rooms.filter((r) => r.cleaningType === "SAME_DAY_TURN").length;
    const sumByType = plan.rooms.length;
    expect(plan.figures.departures + plan.figures.stayovers + plan.figures.arrivals - turns).toBe(sumByType);
  });

  it("Frühanreise schon eingecheckt (301) ist ARRIVAL → nicht in „zu reinigen\" (Board setzt sie trotzdem OCCUPIED)", () => {
    expect(plan.rooms.find((r) => r.room === "301")?.cleaningType).toBe("ARRIVAL");
  });

  it("„Belegt heute Nacht\" = Bleiber + Anreisen (Abend), nicht Morgen-Belegung", () => {
    expect(plan.figures.eveningOccupancy).toBe(plan.figures.stayovers + plan.figures.arrivals);
  });
});

describe("Planungstool-Haus (floorStats/houseTotals)", () => {
  const floors = houseFrom(plan);
  const totals = houseTotals(floors);
  const b = breakdown(floors);

  it("Summe der Teilmengen = Gesamtzahl der Kacheln (139 digitalisierte Zimmer)", () => {
    expect(totals.total).toBe(HOTEL.totalRooms);
    expect(HOTEL.totalRooms).toBe(139);
    expect(b.DEPARTURE + b.TURN + b.STAYOVER + b.ARRIVAL + b.EMPTY).toBe(totals.total);
  });

  it("„belegt\" = Abreise + Turn + Bleiber (Morgen-Belegung), Turn einmal", () => {
    expect(totals.occupied).toBe(b.DEPARTURE + b.TURN + b.STAYOVER);
    expect(totals.departures).toBe(b.DEPARTURE + b.TURN);
    expect(totals.arrivals).toBe(b.ARRIVAL + b.TURN);
  });

  it("Planungstool-„belegt\" und Import-„Zu reinigen\" sind dieselbe Menge — bis auf nicht digitalisierte Zimmer", () => {
    // 999 steht im Tagesplan (Bleiber), hat aber keine Kachel → im Haus fehlt es
    const missing = plan.rooms.filter((r) => r.cleaningType !== "ARRIVAL" && !floors.some((f) => f.tiles.some((t) => t.number === r.room))).length;
    expect(missing).toBe(1);
    expect(totals.occupied).toBe(plan.figures.cleaningCount - missing);
  });

  it("je Etage geht die Rechnung auf", () => {
    for (const f of floors) {
      const s = floorStats(f);
      const empty = f.tiles.filter((t) => t.kind === "EMPTY").length;
      const arrOnly = s.arrivals - s.turns;
      expect(s.occupied + arrOnly + empty).toBe(s.total);
    }
  });

  it("Etage 5 hat keine Zimmer 501–512", () => {
    const n5 = FLOOR_PLAN[5].map((e) => Number(e.number));
    expect(n5.some((n) => n >= 501 && n <= 512)).toBe(false);
  });

  it("Haus hat 145 Zimmer laut Setting roomInventory; 6 davon sind (noch) nicht digitalisiert", () => {
    expect(DEFAULT_SETTINGS.roomInventory).toBe(145);
    expect(DEFAULT_SETTINGS.roomInventory - HOTEL.totalRooms).toBe(6);
  });
});

describe("Live-Board-Zähler (Room.occupancy / Room.status)", () => {
  it("„belegt\" zählt nur occupancy=OCCUPIED, „gereinigt\" = CLEAN/INSPECTED — der Status wird über Nacht nicht zurückgesetzt", () => {
    const rooms = [
      { occupancy: "OCCUPIED", status: "CLEAN" }, // gestern gereinigt, heute Bleiber → zählt als „gereinigt"
      { occupancy: "OCCUPIED", status: "INSPECTED" },
      { occupancy: "OCCUPIED", status: "DIRTY" },
      { occupancy: "OCCUPIED", status: "OUT_OF_ORDER" }, // zählt als belegt
      { occupancy: "VACANT", status: "CLEAN" },
    ];
    const c = computeOccupancyCleanCounts(rooms);
    expect(c).toEqual({ occupied: 4, cleaned: 2, total: 5 });
    expect(c.cleaned).toBeLessThanOrEqual(c.occupied);
  });

  it("/supervisor/planning „Zimmer zu reinigen\" = belegt ODER Abreise heute — OOO/OOS werden dort nicht ausgeschlossen", () => {
    expect(isHousekeepingRelevant({ occupancy: "OCCUPIED", isCheckoutToday: false })).toBe(true);
    expect(isHousekeepingRelevant({ occupancy: "VACANT", isCheckoutToday: true })).toBe(true);
    expect(isHousekeepingRelevant({ occupancy: "VACANT", isCheckoutToday: false })).toBe(false); // reine Anreise mit leerem Zimmer
  });
});

describe("Credits und Wäschewechsel", () => {
  it("Bleiber normal 0,5 (nicht 0,7), mit Wäschewechsel 1, Abreise/Turn 1", () => {
    expect(DEFAULT_SETTINGS.stayoverFactor).toBe(0.5);
    expect(creditFactor("STAYOVER", false, DEFAULT_SETTINGS)).toBe(0.5);
    expect(creditFactor("STAYOVER", true, DEFAULT_SETTINGS)).toBe(1);
    expect(creditFactor("DEPARTURE", false, DEFAULT_SETTINGS)).toBe(1);
    expect(creditFactor("TURN", false, DEFAULT_SETTINGS)).toBe(1);
  });

  it("Wäschewechsel alle 3 Tage ab Anreise bzw. letztem Wechsel; nur Bleiber", () => {
    const due = (room: string) => plan.rooms.find((r) => r.room === room)?.laundryDue;
    expect(due("201")).toBe(true); // Anreise 28.10. → 3 Tage
    expect(due("202")).toBe(false); // Anreise 30.10.
    expect(due("203")).toBe(false); // gewechselt 30.10.
    expect(isLaundryDue({ category: "DEPARTURE", lastLinenChangeAt: null, now: new Date(), linenCycleDays: 3 })).toBe(false);
  });

  it("Credits ändern die Zimmerzahl nicht: „zu reinigen\" bleibt eine Zimmerzahl", () => {
    const credits = plan.rooms
      .filter((r) => r.cleaningType !== "ARRIVAL")
      .reduce((a, r) => a + creditFactor(r.cleaningType === "SAME_DAY_TURN" ? "TURN" : r.cleaningType === "DEPARTURE" ? "DEPARTURE" : "STAYOVER", r.laundryDue, DEFAULT_SETTINGS), 0);
    expect(plan.figures.cleaningCount).toBe(6);
    expect(credits).toBe(1 + 1 + 1 + 0.5 + 0.5 + 0.5); // 101, 102, 201(Wäsche), 202, 203, 999
  });
});
