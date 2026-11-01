import { describe, expect, it } from "vitest";
import { proposePlan } from "@/lib/autoplan/propose";
import { hk, makeDay, makeInput } from "./scenario";

/** H1: Zimmerzahl als Hauptziel und heutige Etagen aus der Etagenzuweisung. */
describe("Zuteilungsvorschlag mit Zimmer-Zielband und Etagenzuweisung", () => {
  const rooms = makeDay(60);

  it("Zimmerzahl bleibt im Zielband je Stufe (Stufe 3 bekommt mehr als Stufe 1)", () => {
    const team = [
      hk("a", "VOLLZEIT", 3, { roomsLo: 13, roomsHi: 13 }),
      hk("b", "VOLLZEIT", 2, { roomsLo: 10, roomsHi: 11 }),
      hk("c", "VOLLZEIT", 2, { roomsLo: 10, roomsHi: 11 }),
      hk("d", "VOLLZEIT", 2, { roomsLo: 10, roomsHi: 11 }),
      hk("e", "VOLLZEIT", 1, { roomsLo: 6, roomsHi: 8 }),
      hk("f", "TEILZEIT", 2, { roomsLo: 7, roomsHi: 7 }),
    ];
    const r = proposePlan(makeInput(rooms, team), { timeLimitMs: 1500 });
    const n = Object.fromEntries(r.metrics.map((m) => [m.hkId, m.rooms]));
    expect(n.a).toBeGreaterThan(n.e);
    for (const m of r.metrics) {
      expect(m.rooms, m.hkId).toBeGreaterThanOrEqual((m.roomsLo ?? 0) - 1);
      expect(m.rooms, m.hkId).toBeLessThanOrEqual((m.roomsHi ?? 99) + 1);
    }
  });

  it("heute eingeteilte Etagen werden bevorzugt", () => {
    const team = [
      hk("a", "VOLLZEIT", 2, { roomsLo: 10, roomsHi: 11, todayFloors: [5] }),
      hk("b", "VOLLZEIT", 2, { roomsLo: 10, roomsHi: 11, todayFloors: [1] }),
    ];
    const few = rooms.filter((x) => x.floor === 1 || x.floor === 5).slice(0, 22);
    const r = proposePlan(makeInput(few, team), { timeLimitMs: 1500 });
    const onFloor = (id: string, f: number) => r.routes.find((x) => x.hkId === id)!.roomIds.filter((rid) => few.find((x) => x.id === rid)!.floor === f).length;
    const total5 = few.filter((x) => x.floor === 5).length, total1 = few.filter((x) => x.floor === 1).length;
    expect(onFloor("a", 5)).toBeGreaterThanOrEqual(Math.min(total5, 10));
    expect(onFloor("b", 1)).toBeGreaterThanOrEqual(Math.min(total1, 10));
    expect(r.reasons[r.routes.find((x) => x.hkId === "a")!.roomIds[0]].join(" ")).toMatch(/Etagenzuweisung/);
  });

  it("Zimmer außerhalb des Bands → Warnung mit Zimmerzahl, Credits nur Hinweis", () => {
    const r = proposePlan(makeInput(rooms.slice(0, 30), [hk("a", "VOLLZEIT", 2, { roomsLo: 10, roomsHi: 11 })]), { timeLimitMs: 500 });
    expect(r.warnings.find((w) => w.code === "ROOMS_OUT_OF_BAND")?.message).toMatch(/30 Zimmer\. Ziel sind 10 bis 11/);
    expect(r.warnings.filter((w) => w.code === "CREDITS_OUT_OF_BAND").every((w) => w.severity === "INFO")).toBe(true);
  });
});
