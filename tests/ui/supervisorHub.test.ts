import { describe, expect, it } from "vitest";
import {
  averageCredits,
  groupOf,
  isDndRoom,
  isOverTarget,
  roomCreditOf,
  roomGroups,
  rosterEntries,
  shortName,
  supervisorKpis,
  tileStateOf,
  type SupRoom,
} from "@/lib/ui/supervisorHub";

// Erfundene Testdaten (keine echten Gäste/Mitarbeitenden).
const room = (p: Partial<SupRoom> & { id: string }): SupRoom => ({
  number: p.id,
  floor: Number(p.id.slice(0, 1)),
  status: "DIRTY",
  isCheckoutToday: false,
  arrivals: [],
  occupancy: "VACANT",
  ...p,
});
const A = { id: "a", name: "Erika Muster" };
const B = { id: "b", name: "Zora Beispiel", dailyNumber: 7 };
const asA = { id: "a", name: A.name };
const rooms: SupRoom[] = [
  room({ id: "301", status: "IN_PROGRESS", assignedTo: asA, routeOrder: 2, isCheckoutToday: true }),
  room({ id: "302", status: "DIRTY", assignedTo: asA, routeOrder: 1, arrivals: [{}] }),
  room({ id: "303", status: "INSPECTED", assignedTo: asA, routeOrder: 3 }),
  room({ id: "304", status: "BLOCKED", blockReason: "DND", assignedTo: asA, occupancy: "OCCUPIED" }),
  room({ id: "305", status: "DIRTY", guestDndActive: true, assignedTo: asA, occupancy: "OCCUPIED" }),
  room({ id: "306", status: "DEFECT_REPORTED", assignedTo: asA }),
  room({ id: "307", status: "PICKUP" }),
  room({ id: "308", status: "CLEAN", defects: [{}] }),
];

describe("Kennzahlen der Übersicht", () => {
  it("zählt offen ohne DND, in Arbeit, DND (Gast oder Personal) und Mängel je Zimmer einmal", () => {
    expect(supervisorKpis(rooms)).toEqual({ open: 2, inProgress: 1, dnd: 2, defects: 2 });
  });
  it("DND-Regel wie dndBlockedSummary", () => {
    expect(isDndRoom({ status: "BLOCKED", blockReason: "DND" })).toBe(true);
    expect(isDndRoom({ status: "BLOCKED", blockReason: "GUEST_IN_ROOM" })).toBe(false);
    expect(isDndRoom({ status: "DIRTY", guestDndActive: true })).toBe(true);
  });
});

describe("Zimmer einer Person nach Gruppen", () => {
  it("Hauptgruppe: DND vor allem, dann in Arbeit, erledigt, gesperrt, sonst offen", () => {
    expect(groupOf({ status: "IN_PROGRESS", guestDndActive: true })).toBe("DND");
    expect(groupOf({ status: "IN_PROGRESS" })).toBe("IN_PROGRESS");
    expect(groupOf({ status: "CLEAN" })).toBe("DONE");
    expect(groupOf({ status: "OUT_OF_ORDER" })).toBe("BLOCKED");
    expect(groupOf({ status: "PICKUP" })).toBe("OPEN");
  });
  it("Reihenfolge der Gruppen fest, Zimmer nach Laufplan, leere Gruppen fehlen, Anreise zusätzlich", () => {
    const g = roomGroups(rooms, "a");
    expect(g.map((x) => x.group)).toEqual(["IN_PROGRESS", "OPEN", "DONE", "ARRIVAL", "DND", "BLOCKED"]);
    expect(g.find((x) => x.group === "DND")!.rooms.map((r) => r.number)).toEqual(["304", "305"]);
    expect(g.find((x) => x.group === "ARRIVAL")!.rooms.map((r) => r.number)).toEqual(["302"]);
    expect(g.find((x) => x.group === "OPEN")!.rooms.map((r) => r.number)).toEqual(["302"]);
    expect(roomGroups(rooms, "niemand")).toEqual([]);
  });
});

describe("Team heute", () => {
  it("Kurzname „Vorname N.“", () => {
    expect(shortName("Erika Muster")).toBe("Erika M.");
    expect(shortName("Erika von Muster")).toBe("Erika M.");
    expect(shortName("Erika")).toBe("Erika");
  });
  it("alphabetisch, Tagesnummer sonst Position, erledigt/gesamt, Credits-Summe, Status", () => {
    const e = rosterEntries([B, A], rooms, () => 1.25);
    expect(e.map((x) => [x.id, x.number])).toEqual([["a", 1], ["b", 7]]);
    expect(e[0]).toMatchObject({ done: 1, total: 6, credits: 7.5, status: "cleaning", short: "Erika M." });
    expect(e[1]).toMatchObject({ done: 0, total: 0, credits: 0, status: "open" });
    const allDone = rosterEntries([A], [room({ id: "401", status: "CLEAN", assignedTo: asA })], () => 0);
    expect(allDone[0].status).toBe("done");
  });
});

describe("Kachel und Credits", () => {
  it("Gast-DND zeigt immer den Mond, sonst Tageskategorie", () => {
    expect(tileStateOf(rooms[4])).toBe("dnd");
    expect(tileStateOf(rooms[0])).toBe("departure");
    expect(tileStateOf(room({ id: "309", arrivals: [{}] }))).toBe("arrival");
    expect(tileStateOf(room({ id: "310", occupancy: "OCCUPIED" }))).toBe("stayover");
    expect(tileStateOf(room({ id: "311" }))).toBe("empty");
  });
  it("Credits wie im Grundriss: Bleiber ohne Wäsche = Tidy, sonst Zimmertyp; ohne Einstellungen 0", () => {
    const s = { roomTypeCredits: { DELUXE: 1.5 }, tidyCredit: 0.5 };
    const stay = room({ id: "312", type: "DELUXE", occupancy: "OCCUPIED" });
    expect(roomCreditOf(stay, false, s)).toBe(0.5);
    expect(roomCreditOf(stay, true, s)).toBe(1.5);
    expect(roomCreditOf(room({ id: "313", type: "DELUXE", isCheckoutToday: true }), false, s)).toBe(1.5);
    expect(roomCreditOf(stay, false, null)).toBe(0);
  });
  it("Überlast nur über der Richtgröße; Ø nur über Kräfte mit Zimmern", () => {
    expect(isOverTarget(14, 14)).toBe(false);
    expect(isOverTarget(14.5, 14)).toBe(true);
    expect(averageCredits([10, 13, 0])).toBe(11.5);
    expect(averageCredits([0])).toBeNull();
  });
});
