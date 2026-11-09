import { describe, expect, it } from "vitest";
import {
  bandOf, cleanKindOf, countEdits, crewSummaries, floorLanes, groupByCrew, loadState, mixEntries, emptyMix,
  planHints, planState, roomsWithoutFloor, worstState, LOAD_UI, type PlanRoom,
} from "@/lib/ui/tagesplan";
import { OVERLOAD_EXTRA_ROOMS, ROOM_BANDS } from "@/lib/ui/tagesplanConfig";

// Erfundene Testdaten — keine echten Namen/Gäste.
const room = (id: string, floor: number | null, kind: PlanRoom["kind"], to: string | null, credit = 1, open = false): PlanRoom =>
  ({ id, number: id, floor, kind, credit, assignedToId: to, open });

describe("Reinigungsart", () => {
  it("Tidy / Linen change / Turn / Deep clean / Anreise aus der Tageszeile", () => {
    expect(cleanKindOf({ kind: "STAYOVER", laundryDue: false })).toBe("tidy");
    expect(cleanKindOf({ kind: "STAYOVER", laundryDue: true })).toBe("linen");
    expect(cleanKindOf({ kind: "TURN", laundryDue: false })).toBe("turn");
    expect(cleanKindOf({ kind: "DEPARTURE", laundryDue: false })).toBe("deep");
    expect(cleanKindOf({ kind: "ARRIVAL", laundryDue: false })).toBe("arrival");
    expect(cleanKindOf({ kind: "OCCUPIED", laundryDue: false })).toBeNull();
  });
  it("Zähler nur für Werte > 0", () => {
    expect(mixEntries({ ...emptyMix(), tidy: 3, turn: 1 })).toEqual([{ kind: "turn", count: 1 }, { kind: "tidy", count: 3 }]);
  });
});

describe("Status je Kraft (Zimmerzahl)", () => {
  it("Spannen je Typ: Vollzeit 10–13, Teilzeit 6–9, Azubi 6–8; unbekannt = Vollzeit", () => {
    expect(bandOf("VOLLZEIT")).toEqual({ lo: 10, hi: 13 });
    expect(bandOf("TEILZEIT")).toEqual({ lo: 6, hi: 9 });
    expect(bandOf("AZUBI")).toEqual({ lo: 6, hi: 8 });
    expect(bandOf(undefined)).toEqual(ROOM_BANDS.VOLLZEIT);
  });
  it("▼ Niedrig / ✓ Ausgewogen / ▲ Hoch / ⚠ Überlast", () => {
    const b = { lo: 10, hi: 13 };
    expect(loadState(9, b)).toBe("low");
    expect(loadState(10, b)).toBe("balanced");
    expect(loadState(13, b)).toBe("balanced");
    expect(loadState(14, b)).toBe("high");
    expect(loadState(13 + OVERLOAD_EXTRA_ROOMS, b)).toBe("high");
    expect(loadState(14 + OVERLOAD_EXTRA_ROOMS, b)).toBe("overload");
  });
  it("jeder Status hat Symbol und Wort (nie nur Farbe)", () => {
    for (const s of Object.values(LOAD_UI)) { expect(s.icon).toBeTruthy(); expect(s.labelKey).toMatch(/^tagesplan\./); expect(s.sign).toBeTruthy(); }
  });
  it("schlimmster Status einer Etage", () => {
    expect(worstState([])).toBeNull();
    expect(worstState(["balanced", "low", "high"])).toBe("high");
    expect(worstState(["overload", "high"])).toBe("overload");
  });
});

describe("Kräfte und Etagen", () => {
  const rooms = [
    room("101", 1, "tidy", "a", 0.5), room("102", 1, "turn", "a", 1), room("201", 2, "linen", "a", 1),
    room("202", 2, "deep", "b", 1.5), room("203", 2, "tidy", null, 0.5, true),
  ];
  const crew = crewSummaries([{ id: "a", name: "Testkraft A" }, { id: "b", name: "Testkraft B", kind: "AZUBI" }, { id: "c", name: "Testkraft C" }], rooms);

  it("Kraft auf zwei Etagen steht in beiden Zeilen mit getrennten Credits", () => {
    const a = crew.find((c) => c.id === "a")!;
    expect(a.rooms).toBe(3);
    expect(a.credits).toBe(2.5);
    expect(a.floors).toEqual([1, 2]);
    expect(a.byFloor[1]).toEqual({ rooms: 2, credits: 1.5 });
    expect(a.byFloor[2]).toEqual({ rooms: 1, credits: 1 });
    const lanes = floorLanes([1, 2], rooms, crew);
    expect(lanes[0].crew.map((p) => [p.id, p.credits])).toEqual([["a", 1.5]]);
    expect(lanes[1].crew.map((p) => [p.id, p.credits])).toEqual([["a", 1], ["b", 1.5]]);
    expect(lanes[1].avgCredits).toBe(1.3); // (1 + 1,5) / 2 = 1,25 → 1,3
    expect(lanes[1].open).toBe(1);
    expect(lanes[1].total).toBe(3);
  });
  it("Mischung der Arten je Kraft", () => {
    expect(crew.find((c) => c.id === "a")!.mix).toMatchObject({ tidy: 1, turn: 1, linen: 1, deep: 0 });
  });
  it("Kraft ohne Zimmer = Niedrig (steht im Fach „Verfügbar“)", () => {
    expect(crew.find((c) => c.id === "c")).toMatchObject({ rooms: 0, state: "low" });
  });
  it("Ohne Etage: 145 laut roomInventory minus Zimmer mit Etage, nie negativ", () => {
    expect(roomsWithoutFloor(145, 139)).toBe(6);
    expect(roomsWithoutFloor(145, 150)).toBe(0);
  });
  it("aufgeklappte Zeile: Zimmer nach Kraft, Offene zuletzt", () => {
    const g = groupByCrew(rooms.filter((r) => r.floor === 2), [{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    expect(g.map((x) => [x.id, x.rooms.map((r) => r.number)])).toEqual([["a", ["201"]], ["b", ["202"]], [null, ["203"]]]);
  });
});

describe("Hinweise", () => {
  it("Überlast, mehr als 2 Etagen, Level-Konflikt, unzugeteilt — mit Sprungziel", () => {
    const many = Array.from({ length: 16 }, (_, i) => room(`r${i}`, (i % 3) + 1, "tidy", "a"));
    const rooms = [...many, room("x1", 4, "turn", "b"), room("x2", 4, "tidy", null, 0.5, true)];
    const crew = crewSummaries([{ id: "a", name: "Testkraft A" }, { id: "b", name: "Testkraft B" }], rooms);
    const hints = planHints({ crew, rooms, levelWarnings: [{ code: "LEVEL1_DEMANDING", hkId: "b", roomIds: ["x1"] }, { code: "TOO_FEW_STAFF" }] });
    expect(hints.map((h) => h.kind)).toEqual(["overload", "floors", "level", "unassigned"]);
    expect(hints[0]).toMatchObject({ crewId: "a", count: 16 });
    expect(hints[1]).toMatchObject({ crewId: "a", floors: [1, 2, 3] });
    expect(hints[2]).toMatchObject({ crewId: "b", floor: 4 });
    expect(hints[3]).toMatchObject({ count: 1, floor: 4, roomIds: ["x2"] });
  });
  it("Level-Konflikt verschwindet, wenn das Zimmer die Kraft gewechselt hat", () => {
    const rooms = [room("x1", 4, "turn", "a")];
    const crew = crewSummaries([{ id: "a", name: "A" }, { id: "b", name: "B" }], rooms);
    expect(planHints({ crew, rooms, levelWarnings: [{ code: "LEVEL1_DEMANDING", hkId: "b", roomIds: ["x1"] }] }).some((h) => h.kind === "level")).toBe(false);
  });
});

describe("Plan-Status", () => {
  it("Vorschlag → Entwurf (nach Änderung) → Bestätigt; ohne Vorschlag Live", () => {
    expect(planState({ hasProposal: true, confirmed: false, edits: 0 })).toBe("proposal");
    expect(planState({ hasProposal: true, confirmed: false, edits: 2 })).toBe("draft");
    expect(planState({ hasProposal: true, confirmed: true, edits: 2 })).toBe("confirmed");
    expect(planState({ hasProposal: false, confirmed: false, edits: 0 })).toBe("live");
  });
  it("Abweichungen zählen jedes geänderte Zimmer einmal", () => {
    expect(countEdits({ a: "x", b: "y", c: null }, { a: "x", b: "z", c: "x", d: null })).toBe(2);
  });
});
