import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RoomRowView, { type ListRoom } from "@/components/lists/RoomRowView";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { floorSummary, groupByLabel, mainLabel, markers, sortRows } from "@/lib/lists/rowLabels";
import { boardFloorSummary } from "@/lib/rooms/boardFloorSummary";

const room = (number: string, kind: ListRoom["kind"], extra: Partial<ListRoom> = {}): ListRoom => ({
  id: `r${number}`, number, floor: Number(number[0]), status: "DIRTY", kind, laundry: false, vip: false, eta: null, guest: null, pax: null,
  dnd: false, credits: 1, traces: [], routeOrder: null, openDefects: 0, guestWish: false, hints: [], ...extra,
});

describe("Hauptlabel und Zusatzmarker", () => {
  it("ein Hauptlabel je Zimmer; Turn heißt Turn", () => {
    expect(mainLabel("SAME_DAY_TURN")).toBe("TURN");
    expect(mainLabel("STAYOVER")).toBe("STAYOVER");
    expect(mainLabel(null)).toBe("NONE");
  });
  it("Marker in fester Reihenfolge, nur wenn zutreffend", () => {
    expect(markers(room("101", "STAYOVER", { vip: true, dnd: true, laundry: true, openDefects: 2, guestWish: true, hints: [{ id: "n", body: "x" }] })))
      .toEqual(["VIP", "DND", "LAUNDRY", "DEFECT", "GUEST_WISH", "HINT"]);
    expect(markers(room("102", "DEPARTURE"))).toEqual([]);
  });
});

describe("Sortierung (nur Anzeige)", () => {
  const rows = [
    room("101", "STAYOVER", { routeOrder: 0 }), room("102", "DEPARTURE", { routeOrder: 1, vip: true }),
    room("103", "SAME_DAY_TURN", { routeOrder: 2 }), room("104", "ARRIVAL", { routeOrder: 3 }),
  ];
  it("Standard: Turns, dann VIP, dann Route", () => {
    expect(sortRows(rows, "suggested").map((r) => r.number)).toEqual(["103", "102", "101", "104"]);
  });
  it("Route: reine Laufplan-Reihenfolge", () => {
    expect(sortRows(rows, "route").map((r) => r.number)).toEqual(["101", "102", "103", "104"]);
  });
  it("nach Art gruppiert, Turns zuerst", () => {
    expect(groupByLabel(rows).map((g) => g.label)).toEqual(["TURN", "DEPARTURE", "STAYOVER", "ARRIVAL"]);
  });
});

describe("Zimmerzeile", () => {
  const html = (r: ListRoom, onOpen?: (n: string) => void) => renderToStaticMarkup(h(LocaleProvider, null, h(RoomRowView, { room: r, onOpen })));
  it("Label mit Text + Icon + Farbe, Marker als Text", () => {
    const out = html(room("103", "SAME_DAY_TURN", { vip: true, openDefects: 1, guestWish: true }));
    expect(out).toContain('data-label="TURN"');
    expect(out).toContain("Same-Day-Turn");
    expect(out).toMatch(/<svg/);
    for (const txt of ["VIP", "Mangel offen", "Gastwunsch"]) expect(out).toContain(txt);
  });
  it("Hinweis aus der Planung ist klar gekennzeichnet", () => {
    const out = html(room("201", "STAYOVER", { hints: [{ id: "n1", body: "Bitte extra Kissen" }] }));
    expect(out).toContain("Hinweis");
    expect(out).toContain("Bitte extra Kissen");
  });
  it("Zimmernummer öffnet das gemeinsame Detailfenster (Button ≥ 44 px)", () => {
    const out = html(room("305", "DEPARTURE"), () => {});
    expect(out).toMatch(/<button[^>]*aria-label="Zimmer 305 öffnen"[^>]*min-h-11/);
    expect(html(room("305", "DEPARTURE"))).not.toContain("Zimmer 305 öffnen");
  });
});

describe("Etagen-Kopfzeile: Summen gehen auf", () => {
  it("Arbeitslisten: Abreisen + Bleiber + reine Anreisen = Zimmer; Turn bei Abreise und Anreise", () => {
    const rows = [room("101", "DEPARTURE"), room("102", "SAME_DAY_TURN"), room("103", "STAYOVER", { status: "CLEAN" }), room("104", "ARRIVAL")];
    const s = floorSummary(rows);
    expect(s).toMatchObject({ rooms: 4, departures: 2, stayovers: 1, arrivals: 2, done: 1, total: 3 });
    expect(s.departures + s.stayovers + (s.arrivals - 1)).toBe(s.rooms);
  });
  it("Live-Board: Kurzinfos und Warnsymbol bei DND/Mangel", () => {
    const b = (x: Partial<Parameters<typeof boardFloorSummary>[0][number]>) => ({ status: "DIRTY", occupancy: "VACANT", isCheckoutToday: false, arrivals: [], defects: [], ...x });
    const s = boardFloorSummary([
      b({ isCheckoutToday: true }), b({ occupancy: "OCCUPIED", status: "CLEAN" }), b({ occupancy: "OCCUPIED", guestDndActive: true }),
      b({ arrivals: [{}] }), b({ defects: [{ workOrder: { status: "OPEN" } }] }), b({ defects: [{ workOrder: { status: "RESOLVED" } }] }),
    ]);
    expect(s).toMatchObject({ rooms: 6, departures: 1, stayovers: 2, arrivals: 1, done: 1, total: 3, dnd: 1, defects: 1 });
  });
});
