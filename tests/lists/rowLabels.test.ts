import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RoomRowView, { type ListRoom } from "@/components/lists/RoomRowView";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { floorSummary, groupByLabel, mainLabel, markers, sortRows } from "@/lib/lists/rowLabels";

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
  const html = (r: ListRoom, onOpen?: (r: ListRoom) => void) => renderToStaticMarkup(h(LocaleProvider, null, h(RoomRowView, { room: r, onOpen })));
  it("Label mit Text + Icon + Farbe, Marker als Text", () => {
    const out = html(room("103", "SAME_DAY_TURN", { vip: true, defects: 1, wish: "CLEAN_REQUEST" }));
    expect(out).toContain('data-label="TURN"');
    expect(out).toContain("Same-Day-Turn");
    expect(out).toMatch(/<svg/);
    expect(out).toContain("VIP");
    expect(out).toMatch(/border-s-gold/);
  });
  it("Hinweis aus der Planung ist klar gekennzeichnet", () => {
    const out = html(room("201", "STAYOVER", { hints: [{ id: "n1", body: "Bitte extra Kissen" }] }));
    expect(out).toContain("Hinweis");
    expect(out).toContain("Bitte extra Kissen");
  });
  it("ganze Zeile öffnet das gemeinsame Zimmerfenster (LiveRoomModal), nur wenn onOpen gesetzt", () => {
    expect(html(room("305", "DEPARTURE"), () => {})).toMatch(/<button[^>]*title="Zimmer 305 öffnen"/);
    expect(html(room("305", "DEPARTURE"))).not.toMatch(/<button[^>]*title="Zimmer 305 öffnen"/);
  });
  it("Markierung auch mit den Feldern der Listen (defects/wish)", () => {
    expect(markers({ ...room("306", "STAYOVER"), defects: 2, wish: "CLEAN_REQUEST" })).toEqual(["DEFECT", "GUEST_WISH"]);
  });
});

describe("Etagen-Kopfzeile: Summen gehen auf", () => {
  it("Arbeitslisten: Abreisen + Bleiber + reine Anreisen = Zimmer; Turn bei Abreise und Anreise", () => {
    const rows = [room("101", "DEPARTURE"), room("102", "SAME_DAY_TURN"), room("103", "STAYOVER", { status: "CLEAN" }), room("104", "ARRIVAL")];
    const s = floorSummary(rows);
    expect(s).toMatchObject({ rooms: 4, departures: 2, stayovers: 1, arrivals: 2, done: 1, total: 3 });
    expect(s.departures + s.stayovers + (s.arrivals - 1)).toBe(s.rooms);
  });
});
