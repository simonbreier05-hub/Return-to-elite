import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RoomRowView, { type ListRoom } from "@/components/lists/RoomRowView";
import RowLegend from "@/components/lists/RowLegend";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";

const room = (o: Partial<ListRoom> = {}): ListRoom => ({
  id: "r1", number: "208", floor: 2, status: "DIRTY", kind: "STAYOVER", laundry: true, vip: true, eta: null, guest: "Herr Dr. Krüger", pax: 2, dnd: true, credits: 0.5,
  type: "JUNIOR_SUITE", defects: 2, wish: "CLEAN_REQUEST",
  traces: [{ id: "t1", code: "A", text: "Allergiker Federn", dept: "HOUSEKEEPING", status: "OPEN" }, { id: "t2", code: "B", text: "Zusatzkissen", dept: "HOUSEMAN", status: "OPEN" }],
  ...o,
});
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));

describe("Zimmerzeile: alles auf einen Blick", () => {
  const out = html(h("ol", null, h(RoomRowView, { room: room(), showDept: true, onOpen: () => {} })));
  it("Nummer, Typ, Art, Wäsche, VIP, DND, Mangel, Gästewunsch, Traces (Anzahl + Text) — jeweils mit Wort", () => {
    for (const s of ["208", "Junior", "Bleiber", "Wäsche", "VIP", "Bitte nicht stören", "Mangel (2)", "Reinigungswunsch", "Traces (2)", "Allergiker Federn", "Zusatzkissen", "Herr Dr. Krüger"]) expect(out, s).toContain(s);
  });
  it("Status steht als Wort in der Zeile", () => expect(out).toMatch(/Schmutzig|Dirty/i));
  it("ist antippbar (Knopf ≥ 44 px) — ohne onOpen (Housekeeper) nicht", () => {
    expect(out).toContain("<button");
    expect(out).toContain("min-h-11");
    expect(html(h("ol", null, h(RoomRowView, { room: room({ defects: 0, wish: null }) })))).not.toContain("<button");
  });
  it("lange Traces brechen um statt abgeschnitten zu werden", () => expect(out).toContain("break-words"));
  it("Mangel und Wunsch erscheinen nicht, wenn es keine gibt (Housekeeper-Liste)", () => {
    const hk = html(h("ol", null, h(RoomRowView, { room: room({ defects: undefined, wish: undefined, type: undefined }) })));
    expect(hk).not.toMatch(/Mangel|Reinigungswunsch/);
  });
});

describe("Vorgemerkt / vor Anreise prüfen", () => {
  const row = (kind: ListRoom["kind"]) => html(h("ol", null, h(RoomRowView, { room: room({ kind, dnd: false }), precheck: true })));
  it("Abreise ohne Anreise ist vorgemerkt, Anreise-Zimmer heißt „nochmal prüfen“ — nur in der Supervisor-Karte", () => {
    expect(row("DEPARTURE")).toContain("Vorgemerkt: vor nächster Anreise prüfen");
    expect(row("ARRIVAL")).toContain("Anreise heute: nochmal prüfen");
    expect(html(h("ol", null, h(RoomRowView, { room: room({ kind: "ARRIVAL" }) })))).not.toContain("nochmal prüfen");
  });
});

describe("Legende", () => {
  it("nennt jedes Symbol mit Wort", () => {
    const out = html(h(RowLegend));
    for (const s of ["Abreise", "Bleiber", "Anreise", "Wäsche", "VIP", "Bitte nicht stören", "Mangel", "Reinigungswunsch", "Gästewunsch", "Traces"]) expect(out, s).toContain(s);
  });
});

describe("Live-Listen: Verdrahtung", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("Supervisor-Liste im Duty-Manager-Board ist ausklappbar, Zustand bleibt in sessionStorage", () => {
    const src = read("src/components/lists/LiveListsPanel.tsx");
    expect(src).toContain("aria-expanded={isOpen}");
    expect(src).toContain('usePersistedSet("stayclean.liveSup.open")');
    expect(src).toMatch(/lists\.progress.*lists\.supRooms/s); // eingeklappt: Fortschritt + Zimmerzahl
  });
  it("Listen laden bei Trace-/Notiz-Änderungen live nach (kein Neuladen der Seite)", () => {
    for (const f of ["src/components/lists/LiveListsPanel.tsx", "src/components/lists/SupervisorList.tsx"]) {
      const src = read(f);
      for (const ev of ["trace:update", "note:new", "note:update"]) expect(src, `${f} ${ev}`).toContain(`"${ev}"`);
      expect(src).not.toMatch(/location\.reload|router\.refresh|key=\{.*reload/);
    }
    expect(read("src/components/lists/LiveRoomModal.tsx")).toContain('"trace:update"');
  });
  it("alle Zimmer in allen Live-Listen öffnen das gemeinsame Modal", () => {
    for (const f of ["src/components/lists/LiveListsPanel.tsx", "src/components/lists/SupervisorList.tsx", "src/components/lists/ServiceOverview.tsx"]) expect(read(f), f).toContain("LiveRoomModal");
    expect(read("src/components/lists/LiveRoomModal.tsx")).toContain("RoomDetailModal"); // keine zweite Variante
  });
  it("Änderungen im Modal nur mit zweitem Tipp", () => {
    const src = read("src/components/RoomEditPanel.tsx");
    expect(src).not.toMatch(/<button[^>]*onClick=\{\(\) => (setStatus|setDnd|assign|traceDone|addTrace)/);
    expect(read("src/components/TwoTapButton.tsx")).toContain("setArmed(true)");
  });
});
