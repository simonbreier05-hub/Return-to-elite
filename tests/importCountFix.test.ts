import { describe, expect, it } from "vitest";
import { parseInHouse } from "@/lib/import/parsers";
import { checkPlausibility, plausibilitySignature } from "@/lib/import/plausibility";
import { computeDayNumbers, isToClean, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { needsCleaning } from "@/lib/lists/serviceOverview";
import { afterListDeleted, type ImportItem } from "@/components/planung/useImportSession";
import type { InHouseRow, PdfLine } from "@/lib/import/types";

const line = (page: number, ...segments: string[]): PdfLine => ({ page, y: 0, segments, text: segments.join(" ") });
const head = (page: number) => [line(page, "HOTEL DE ROME BERLIN", "28/10/26"), line(page, "In House Guests"), line(page, "Room No.", "Name", "Arr. Date", "Dep. Date", "Adl.", "Chl.")];

describe("In-House-Parser: Layout-Varianten werden gelesen, nicht verworfen", () => {
  it("ohne Spalten Zimmer/Nächte, mit Etagenüberschrift, Seitenumbruch, leerer Firma, VIP, „T“ am Ende, Kinder", () => {
    const lines = [
      ...head(1), line(1, "Etage 1"),
      line(1, "101", "Probe, Anna Mrs.", "ACME GmbH", "V1", "25/10/26", "31/10/26", "2", "1", "XAS", "CKIN", "T"),
      line(1, "102", "Demo, Jonas Mr.", "28/10/26", "30/10/26", "1", "0", "XDL", "RESV"),
      line(1, "Page 1 of 2"),
      ...head(2), line(2, "Etage 1 (Fortsetzung)"),
      line(2, "104", "Test, Hans Mr.", "V2", "20/10/26", "29/10/26", "1", "0", "9XDL", "CKIN"), // ohne Zimmer-Spalte, Nächte mit Typ verklebt
      line(2, "Total", "4", "1", "3"),
      line(2, "Page 2 of 2"),
    ];
    const r = parseInHouse(lines, { expectedDate: "2026-10-28" });
    expect(r.issues.filter((i) => i.severity !== "INFO" && i.code !== "DATE_FORMAT_DIFFERS")).toEqual([]); // TT/MM/JJ ≠ Standard-Layout: nur Hinweis
    expect(r.pagesTotal).toBe(2);
    expect(r.rows.map((x) => [x.room, x.status, x.adults, x.children, x.nights, x.roomType, x.vip])).toEqual([
      ["101", "CKIN", 2, 1, 6, "XAS", true],
      ["102", "RESV", 1, 0, 2, "XDL", false],
      ["104", "CKIN", 1, 0, 9, "XDL", true],
    ]);
  });

  it("eine Zeile mit Datumswerten ohne erkennbare Zimmernummer wird gemeldet (nur Seite), nie still verworfen", () => {
    const r = parseInHouse([...head(1), line(1, "101Probe, Anna", "25/10/26", "31/10/26", "2", "0", "CKIN"), line(1, "102", "Demo, Jonas", "27/10/26", "30/10/26", "1", "0", "CKIN")], { expectedDate: "2026-10-28" });
    expect(r.rows).toHaveLength(1);
    const w = r.issues.find((i) => i.code === "ROW_SKIPPED")!;
    expect(w.severity).toBe("WARNING");
    expect(w.message).toMatch(/1 Zeile\(n\).*Seite 1/);
    expect(w.message).not.toMatch(/Probe/);
  });
});

const row = (i: number, o: Partial<DayNumberRow> = {}): DayNumberRow => ({
  id: `r${i}`, number: String(100 + i), kind: "STAYOVER", laundryDue: false, nightsKnown: true, status: "DIRTY", occupied: true, assignedToId: null, assignedToday: false, ...o,
});

describe("Zu reinigen: eine Regel für alle Ansichten", () => {
  it("Bleiber immer, Abreisen/Turns immer, Anreise nur in ein nicht gereinigtes Zimmer, außer Betrieb nie", () => {
    expect(isToClean("STAYOVER", "INSPECTED")).toBe(true); // auch ein schon gereinigter Bleiber gehört zur Tagesmenge (zählt dann als gereinigt)
    expect(isToClean("DEPARTURE", "DIRTY")).toBe(true);
    expect(isToClean("TURN", "DIRTY")).toBe(true);
    expect(isToClean("ARRIVAL", "INSPECTED")).toBe(false);
    expect(isToClean("ARRIVAL", "DIRTY")).toBe(true);
    expect(isToClean("STAYOVER", "OUT_OF_ORDER")).toBe(false);
    expect(isToClean("OCCUPIED", "DIRTY")).toBe(false);
    expect(needsCleaning("ARRIVAL", "DIRTY")).toBe(true);
    expect(needsCleaning("STAYOVER_LINEN")).toBe(true);
  });

  it("28.10.: 75 Bleiber + 14 Abreisen + 12 Turns + 26 Anreisen (sauber) → 101 zu reinigen, 113 von 145 belegt", () => {
    let i = 0;
    const rows = [
      ...Array.from({ length: 75 }, () => row(i++, { kind: "STAYOVER" })),
      ...Array.from({ length: 14 }, () => row(i++, { kind: "DEPARTURE" })),
      ...Array.from({ length: 12 }, () => row(i++, { kind: "TURN" })),
      ...Array.from({ length: 26 }, () => row(i++, { kind: "ARRIVAL", status: "INSPECTED", occupied: false })),
    ];
    const n = computeDayNumbers({ rows, inventory: 145 });
    expect(n).toMatchObject({ occupied: 113, inventory: 145, toClean: 101, byKind: { STAYOVER: 75, DEPARTURE: 14, TURN: 12, ARRIVAL: 0 } });
    // eine Anreise in ein noch schmutziges Zimmer kommt dazu
    rows[rows.length - 1].status = "DIRTY";
    expect(computeDayNumbers({ rows, inventory: 145 })).toMatchObject({ toClean: 102, byKind: { ARRIVAL: 1 } });
  });
});

describe("Plausibilitätsprüfung nach dem Import", () => {
  const ih = (n: number, resv = 0): InHouseRow[] => Array.from({ length: n }, (_, k) => ({
    room: String(100 + k), guest: { salutation: null, title: null, lastName: "X", fullName: "X" }, arrDate: k < resv ? "2026-10-28" : "2026-10-25",
    depDate: "2026-10-30", adults: 1, children: 0, nights: 2, vip: false, status: k < resv ? "RESV" : "CKIN",
  }));
  const forecast = { occupiedRooms: 113, arrivals: 38, departures: 26, persons: 155, occupancyPct: 79.58, outOfOrder: 3 };

  it("meldet den konkreten Unterschied: „In-House zeigt 90 belegt, Forecast erwartet 113“", () => {
    const f = checkPlausibility({ date: "2026-10-28", inventory: 145, forecast, inHouse: ih(90, 38), arrivals: null, departures: null,
      plan: { occupied: 90, arrivals: 38, departures: 24 }, unknownRooms: ["430"] });
    const msg = f.map((x) => x.message);
    expect(msg).toContain("In-House zeigt 90 belegt, Forecast erwartet 113.");
    expect(msg).toContain("Tagesplan zeigt 90 belegt, Forecast erwartet 113.");
    expect(msg).toContain("Tagesplan zeigt 24 Abreisen heute, Forecast erwartet 26.");
    expect(msg).toContain("In-House zeigt 90 Personen, Forecast erwartet 155.");
    expect(msg.find((m) => m.startsWith("In-House ergibt 63,38 % Auslastung"))).toBeTruthy();
    expect(msg).toContain("1 Zimmer aus den Listen fehlen im Zimmerstamm und daher im Plan: 430.");
    expect(f.map((x) => x.key)).not.toContain("ARRIVALS"); // 38 RESV = Forecast
  });

  it("ohne Forecast: Listen untereinander; Fingerabdruck ändert sich mit den Befunden (neue Abweichung → erneut zeigen)", () => {
    const f = checkPlausibility({ date: "2026-10-28", inventory: 145, forecast: null, inHouse: ih(113), arrivals: null, departures: null,
      plan: { occupied: 110, arrivals: 0, departures: 0 }, unknownRooms: [] });
    expect(f.map((x) => x.message)).toEqual(["Tagesplan zeigt 110 belegt, In-House zeigt 113."]);
    expect(plausibilitySignature("2026-10-28", f)).not.toBe(plausibilitySignature("2026-10-28", []));
  });
});

describe("Liste löschen und neu einlesen ohne Verlassen der Seite", () => {
  it("entfernt alle Zustände des gelöschten Typs (Datei, Vorschau, Fehler, „übernommen“), andere bleiben", () => {
    const items: ImportItem[] = [
      { id: "1", name: "inhouse.pdf", phase: "applied", type: "INHOUSE" },
      { id: "2", name: "inhouse2.pdf", phase: "error", type: "INHOUSE", error: "x" },
      { id: "3", name: "dep.pdf", phase: "applied", type: "DEPARTURES" },
    ];
    const left = afterListDeleted(items, "INHOUSE");
    expect(left.map((x) => x.id)).toEqual(["3"]);
    // eine neu gewählte Datei desselben Typs ist dann der einzige Eintrag für die Kachel
    const next = [...left, { id: "4", name: "inhouse.pdf", phase: "read" as const, type: "INHOUSE" as const }];
    expect([...next].reverse().find((x) => x.type === "INHOUSE")?.id).toBe("4");
  });
});
