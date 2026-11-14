import { describe, expect, it } from "vitest";
import { ROOM_STATUSES } from "@/lib/domain";
import { STATUS_UI } from "@/lib/ui/status";
import {
  earlyArrivals,
  filterCounts,
  hkKpis,
  hkMarkers,
  hkRowStatus,
  kindPill,
  langCode,
  withoutLeadingSymbol,
  matchesFilter,
  type HkRoomView,
} from "@/lib/ui/hkHub";

/** Erfundene Testzimmer — keine echten Gastdaten. */
const room = (over: Partial<HkRoomView> = {}): HkRoomView => ({
  id: "r1", number: "305", status: "DIRTY", kind: "SAME_DAY_TURN", vip: false, laundry: false, dnd: false,
  paused: false, defects: 0, eta: null, early: false, urgent: false, ...over,
});

describe("Status → Anzeige (D2)", () => {
  it("jeder Zimmerstatus des Bestands hat eine Anzeige mit Symbol und Text", () => {
    for (const s of ROOM_STATUSES) {
      const ui = hkRowStatus(room({ status: s }));
      expect(STATUS_UI[ui].icon).toBeTruthy();
      expect(STATUS_UI[ui].labelKey).toMatch(/^ui\.status\./);
    }
  });
  it("offen, in Reinigung, erledigt, Nacharbeit, Mangel", () => {
    expect(hkRowStatus(room({ status: "DIRTY" }))).toBe("open");
    expect(hkRowStatus(room({ status: "IN_PROGRESS" }))).toBe("cleaning");
    expect(hkRowStatus(room({ status: "CLEAN" }))).toBe("done");
    expect(hkRowStatus(room({ status: "INSPECTED" }))).toBe("done");
    expect(hkRowStatus(room({ status: "PICKUP" }))).toBe("rework");
    expect(hkRowStatus(room({ status: "DEFECT_REPORTED" }))).toBe("defect");
    expect(hkRowStatus(room({ status: "BLOCKED" }))).toBe("dnd");
  });
  it("Pause überdeckt „In Reinigung“, nie ein erledigtes Zimmer", () => {
    expect(hkRowStatus(room({ status: "IN_PROGRESS", paused: true }))).toBe("paused");
    expect(hkRowStatus(room({ status: "CLEAN", paused: true }))).toBe("done");
  });
  it("Gast-DND zeigt an einem offenen Zimmer „DND“, ändert laufende Arbeit nicht", () => {
    expect(hkRowStatus(room({ status: "DIRTY", dnd: true }))).toBe("dnd");
    expect(hkRowStatus(room({ status: "IN_PROGRESS", dnd: true }))).toBe("cleaning");
  });
});

describe("Pille, Marker, Sprache", () => {
  it("Reinigungsart → Pille, ohne Tagesplan keine", () => {
    // Betrieb L2 (Meeting 13.11.): Turn Blau/Rot, Bleiber Grün, Abreise Rot, Anreise Blau
    expect(kindPill("SAME_DAY_TURN")).toEqual({ labelKey: "hkHub.kindTurn", tone: "info", edge: "danger" });
    expect(kindPill("DEPARTURE")?.tone).toBe("danger");
    expect(kindPill("ARRIVAL")?.tone).toBe("info");
    expect(kindPill("STAYOVER")?.tone).toBe("success");
    expect(kindPill(null)).toBeNull();
  });
  it("Marker: Priorität zuerst, kein doppeltes DND/Pause neben dem Status", () => {
    expect(hkMarkers(room({ urgent: true, eta: "14:00" }))).toEqual(["priority", "arrival"]);
    expect(hkMarkers(room({ dnd: true }))).not.toContain("dnd");
    expect(hkMarkers(room({ status: "IN_PROGRESS", dnd: true }))).toContain("dnd");
    expect(hkMarkers(room({ status: "IN_PROGRESS", paused: true }))).not.toContain("pause");
    expect(hkMarkers(room({ kind: "STAYOVER", laundry: true, vip: true }))).toEqual(["laundry", "vip"]); // Betrieb L2: Wäsche-Symbol vorn
    expect(hkMarkers(room({ kind: "STAYOVER", eta: "14:00" }))).not.toContain("arrival");
  });
  it("Sprachkürzel", () => {
    expect(langCode("en")).toBe("EN");
    expect(langCode("pt-BR")).toBe("PT");
    expect(langCode("")).toBeNull();
    expect(langCode(null)).toBeNull();
    expect(langCode("??")).toBeNull();
  });
});

describe("Filter und Kennzahlen", () => {
  const rooms = [
    room({ id: "a", kind: "SAME_DAY_TURN" }),
    room({ id: "b", kind: "STAYOVER", vip: true }),
    room({ id: "c", kind: "STAYOVER" }),
  ];
  it("Filter zählen nur vorhandene Arten, „Alle“ immer", () => {
    expect(filterCounts(rooms)).toEqual([
      { filter: "all", count: 3 },
      { filter: "turn", count: 1 },
      { filter: "stayover", count: 2 },
      { filter: "vip", count: 1 },
    ]);
    expect(filterCounts([])).toEqual([{ filter: "all", count: 0 }]);
    expect(matchesFilter(rooms[1], "vip")).toBe(true);
  });
  it("Kennzahlen aus den Gruppen; Fortschritt der Tagesliste hat Vorrang", () => {
    const st = ["DIRTY", "BLOCKED", "IN_PROGRESS", "PICKUP", "CLEAN", "INSPECTED", "OUT_OF_ORDER"];
    expect(hkKpis(st)).toEqual({ total: 6, done: 2, inProgress: 2, open: 2 });
    expect(hkKpis(st, { done: 3, total: 8 })).toEqual({ total: 8, done: 3, inProgress: 2, open: 2 });
  });
});

describe("Frühe Anreisen", () => {
  it("nur offene Zimmer mit Kennzeichen, früheste Zeit", () => {
    const res = earlyArrivals([
      room({ number: "312", early: true, eta: "15:00" }),
      room({ number: "305", early: true, eta: "14:00" }),
      room({ number: "307", early: true, status: "CLEAN", eta: "11:00" }),
      room({ number: "308", early: false, eta: "09:00" }),
    ]);
    expect(res.rooms.map((r) => r.number)).toEqual(["305", "312"]);
    expect(res.by).toBe("14:00");
  });
  it("ohne Kennzeichen kein Banner", () => {
    expect(earlyArrivals([room()]).rooms).toEqual([]);
  });
});

describe("Texte ohne vorangestelltes Zeichen", () => {
  it("schneidet nur Zeichen vorn ab, Text bleibt", () => {
    expect(withoutLeadingSymbol("▶ Reinigung starten")).toBe("Reinigung starten");
    expect(withoutLeadingSymbol("🔧 Mangel…")).toBe("Mangel…");
    expect(withoutLeadingSymbol("✓ Als rein markieren · zur Prüfung")).toBe("Als rein markieren · zur Prüfung");
    expect(withoutLeadingSymbol("Fortsetzen")).toBe("Fortsetzen");
  });
});
