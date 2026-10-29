import { describe, expect, it } from "vitest";
import { hkGroupOf, orderRoute, primaryActionFor } from "@/lib/rooms/hkGroups";

describe("Housekeeper-Hub: Gruppen, Ein-Tipp-Schritt, Route", () => {
  it("Gruppen nach Status — pausiert bleibt „Jetzt dran“ (Status IN_PROGRESS), zählt nie als fertig", () => {
    expect(hkGroupOf("IN_PROGRESS")).toBe("NOW");
    expect(hkGroupOf("PICKUP")).toBe("NOW");
    expect(hkGroupOf("DIRTY")).toBe("NEXT");
    expect(hkGroupOf("BLOCKED")).toBe("NEXT");
    expect(hkGroupOf("CLEAN")).toBe("DONE");
    expect(hkGroupOf("INSPECTED")).toBe("DONE");
    expect(hkGroupOf("OUT_OF_ORDER")).toBe("OTHER");
    expect(hkGroupOf("whatever")).toBe("OTHER");
  });
  it("ein Knopf: Start / Fertig / Fortsetzen; Gast-DND sperrt nur den Start; nie Freigabe", () => {
    expect(primaryActionFor("DIRTY")).toBe("START");
    expect(primaryActionFor("PICKUP")).toBe("START");
    expect(primaryActionFor("DIRTY", { guestDnd: true })).toBe("DND");
    expect(primaryActionFor("BLOCKED")).toBe("UNBLOCK");
    expect(primaryActionFor("IN_PROGRESS")).toBe("FINISH");
    expect(primaryActionFor("IN_PROGRESS", { guestDnd: true })).toBe("FINISH");
    expect(primaryActionFor("IN_PROGRESS", { paused: true })).toBe("RESUME");
    expect(primaryActionFor("CLEAN")).toBeNull();
    expect(primaryActionFor("INSPECTED")).toBeNull();
  });
  it("gespeicherte Reihenfolge zuerst, dann nach Priorität", () => {
    const r = (id: string, floor: number, routeOrder: number | null = null) => ({ id, number: id, floor, section: `${floor}A`, routeOrder });
    const out = orderRoute([r("101", 1), r("301", 3, 1), r("201", 2), r("302", 3, 0)], (id) => (id === "201" ? 50 : 0));
    expect(out.map((x) => x.id)).toEqual(["302", "301", "201", "101"]);
  });
});
