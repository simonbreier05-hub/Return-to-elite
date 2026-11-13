import { describe, expect, it } from "vitest";
import { ROOM_LIST, planRoomListSync } from "@/lib/rooms/roomList";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import { ROOM_TYPE_DEFAULT_CREDITS } from "@/lib/domain";

describe("Offizielle Zimmerliste v2.1", () => {
  it("145 Zimmer, Summe 170 Credits, Etagen 32/36/33/26/18, keine Doppelten", () => {
    expect(ROOM_LIST).toHaveLength(145);
    expect(ROOM_LIST.reduce((n, e) => n + e.credit, 0)).toBe(170);
    const floors = [1, 2, 3, 4, 5].map((f) => ROOM_LIST.filter((e) => e.floor === f).length);
    expect(floors).toEqual([32, 36, 33, 26, 18]);
    expect(new Set(ROOM_LIST.map((e) => e.number)).size).toBe(145);
    for (const e of ROOM_LIST) expect(e.number.startsWith(String(e.floor))).toBe(true);
  });

  it("Stichproben: 304 = 3,5 · 101 = 2 · 302 = 1,75 · 307 nicht aktiv", () => {
    const by = (n: string) => ROOM_LIST.find((e) => e.number === n);
    expect(by("304")?.credit).toBe(3.5);
    expect(by("101")?.credit).toBe(2);
    expect(by("302")?.credit).toBe(1.75);
    expect(by("307")).toBeUndefined();
  });

  it("Credit je Zimmer gilt vor dem Kategorie-Wert; ohne Zimmer-Credit bleibt die Kategorie", () => {
    expect(computeRoomCredit({ type: "PENTHOUSE", credits: ROOM_TYPE_DEFAULT_CREDITS, roomCredit: 3.5 })).toBe(3.5);
    expect(computeRoomCredit({ type: "DELUXE", credits: ROOM_TYPE_DEFAULT_CREDITS, roomCredit: null })).toBe(1.25);
    expect(computeRoomCredit({ type: "DELUXE", credits: ROOM_TYPE_DEFAULT_CREDITS })).toBe(1.25);
  });

  it("Sync-Plan: legt fehlende an, ändert abweichende, deaktiviert Zimmer außerhalb der Liste, löscht nie", () => {
    const existing = [
      { number: "101", floor: 1, type: "SUITE", credit: 2, active: true }, // unverändert
      { number: "102", floor: 1, type: "UNVERIFIED", credit: null, active: true }, // geändert
      { number: "307", floor: 3, type: "UNVERIFIED", credit: null, active: true }, // nicht in der Liste
      { number: "999", floor: 9, type: "UNVERIFIED", credit: null, active: false }, // schon inaktiv
    ];
    const plan = planRoomListSync(existing);
    expect(plan.unchanged).toBe(1);
    expect(plan.update.map((u) => u.entry.number)).toEqual(["102"]);
    expect(plan.deactivate).toEqual(["307"]);
    expect(plan.create).toHaveLength(143);
    // zweiter Lauf nach Anwenden = nichts zu tun
    const after = [...ROOM_LIST.map((e) => ({ number: e.number, floor: e.floor, type: e.type, credit: e.credit, active: true })), { number: "307", floor: 3, type: "UNVERIFIED", credit: null, active: false }];
    const again = planRoomListSync(after);
    expect([again.create.length, again.update.length, again.deactivate.length, again.unchanged]).toEqual([0, 0, 0, 145]);
  });
});
