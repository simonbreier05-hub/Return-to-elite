import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ROOM_STATUSES } from "@/lib/domain";
import { STATUS_UI } from "@/lib/ui/status";
import {
  ROOM_FLAG_UI,
  assignedLabel,
  guestRequestIcon,
  roomWindowFlags,
  roomWindowPrimary,
  roomWindowStatus,
  statusTargetIcon,
  windowGuestName,
} from "@/lib/ui/roomWindow";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { GlassMode } from "@/components/shell/GlassMode";
import RoomDayInfo from "@/components/lists/RoomDayInfo";
import RoomEditPanel from "@/components/RoomEditPanel";
import TwoTapButton from "@/components/TwoTapButton";
import type { RoomDetail } from "@/lib/rooms/roomDetail";

/** Zimmer-Fenster „Glas & Premium“ (D7). Nur erfundene Testdaten. */
const SRC = path.join(__dirname, "..", "..", "src");
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");
const html = (el: ReturnType<typeof h>, glass: boolean) => renderToStaticMarkup(h(LocaleProvider, null, h(GlassMode, { on: glass }, el)));

const detail = (over: Partial<RoomDetail> = {}): RoomDetail => ({
  id: "r-test", number: "312", floor: 3, section: "A", type: "STANDARD", status: "DIRTY", blockReason: null, oooUntil: null, reworkNote: null,
  occupancy: null, isCheckoutToday: false, assignedTo: null, day: null, guestDndActive: false, traces: [], notes: [], pause: null, canMessage: false,
  defects: [], guestRequests: [], logbook: [], allowedStatuses: ["IN_PROGRESS", "CLEAN"], canBlock: true, attendants: [{ id: "u1", name: "Testkraft Eins", dailyNumber: 4 }],
  ...over,
});

describe("Anzeige-Regeln Zimmer-Fenster", () => {
  it("jeder Zimmerstatus hat Symbol und Text", () => {
    for (const s of ROOM_STATUSES) {
      const ui = roomWindowStatus({ status: s, paused: false, guestDnd: false });
      expect(STATUS_UI[ui].icon).toBeTruthy();
      expect(STATUS_UI[ui].labelKey).toMatch(/^ui\.status\./);
      expect(statusTargetIcon(s)).toBeTruthy();
    }
  });
  it("Pause überdeckt, Gast-DND zeigt DND an offenen Zimmern, erledigte bleiben erledigt", () => {
    expect(roomWindowStatus({ status: "IN_PROGRESS", paused: true, guestDnd: false })).toBe("paused");
    expect(roomWindowStatus({ status: "DIRTY", paused: false, guestDnd: true })).toBe("dnd");
    expect(roomWindowStatus({ status: "BLOCKED", blockReason: "DND", paused: false, guestDnd: false })).toBe("dnd");
    expect(roomWindowStatus({ status: "CLEAN", paused: true, guestDnd: true })).toBe("done");
  });
  it("Kennzeichen: belegt, Abreise heute, Mangel nur wenn der Status ihn nicht zeigt — immer mit Symbol + Text", () => {
    expect(roomWindowFlags({ occupancy: "OCCUPIED", isCheckoutToday: true, defects: 1, shown: "open" })).toEqual(["occupied", "checkout", "defect"]);
    expect(roomWindowFlags({ occupancy: "VACANT", isCheckoutToday: false, defects: 2, shown: "defect" })).toEqual([]);
    for (const f of Object.values(ROOM_FLAG_UI)) { expect(f.icon).toBeTruthy(); expect(f.labelKey).toBeTruthy(); }
  });
  it("Gast nur „Anrede Titel Nachname“ — nie Vornamen", () => {
    expect(windowGuestName("Herr Dr. Max Testmann")).toBe("Herr Dr. Testmann");
    expect(windowGuestName("Testfrau, Erika Frau")).toBe("Frau Testfrau");
    expect(windowGuestName("Herr Testmann", "IMPORT")).toBe("Herr Testmann");
    expect(windowGuestName("—")).toBeNull();
    expect(windowGuestName(null)).toBeNull();
  });
  it("höchstens ein Hauptknopf: eigene Aktion vor Fortsetzen, sonst keiner", () => {
    expect(roomWindowPrimary({ hasOwnPrimary: true, paused: true })).toBe("own");
    expect(roomWindowPrimary({ hasOwnPrimary: false, paused: true })).toBe("resume");
    expect(roomWindowPrimary({ hasOwnPrimary: false, paused: false })).toBeNull();
  });
  it("Zuständig und Gastanfrage-Symbole", () => {
    expect(assignedLabel({ name: "Testkraft", dailyNumber: 7 })).toBe("#7 Testkraft");
    expect(assignedLabel({ name: "Testkraft", dailyNumber: null })).toBe("Testkraft");
    expect(assignedLabel(null)).toBeNull();
    expect(guestRequestIcon("DND")).toBe("moon");
    expect(guestRequestIcon("CONTACT")).toBe("message");
  });
});

describe("Glas nur mit GlassMode, sonst unverändert hell", () => {
  it("RoomDayInfo: Glas mit Pillen und Kurzname, hell wie bisher", () => {
    const day = { kind: "ARRIVAL", laundry: true, vip: true, eta: "14:00", guest: "Frau Testfrau", pax: 2 };
    const g = html(h(RoomDayInfo, { day }), true);
    expect(g).toContain("rounded-pill");
    expect(g).toContain("Frau Testfrau");
    expect(g).not.toMatch(/bg-white|text-graphite/);
    const l = html(h(RoomDayInfo, { day }), false);
    expect(l).toContain("bg-white");
  });
  it("RoomEditPanel: Glas ohne helle Klassen, Status-Knöpfe mit Symbol + Text, Zwei-Tipp bleibt", () => {
    const g = html(h(RoomEditPanel, { room: detail(), onChanged: () => {} }), true);
    expect(g).toContain('data-testid="room-edit"');
    expect(g).not.toMatch(/bg-white|bg-parchment|text-graphite|border-charcoal/);
    expect(g).toMatch(/<svg[\s\S]*Auf In Reinigung setzen|<svg[\s\S]*setzen/);
    expect(g).toContain("Testkraft Eins");
    const l = html(h(RoomEditPanel, { room: detail(), onChanged: () => {} }), false);
    expect(l).toContain("bg-parchment/40");
  });
  it("TwoTapButton: Glas-Tippfläche ≥ 48 px mit Fokusring", () => {
    const g = html(h(TwoTapButton, { onConfirm: () => {} }, "Speichern"), true);
    expect(g).toContain("min-h-(--size-touch-min)");
    expect(g).toMatch(/focus-visible/);
    expect(html(h(TwoTapButton, { onConfirm: () => {} }, "Speichern"), false)).toContain("min-h-11");
  });
});

describe("Aufbau (Quelltext)", () => {
  it("Glas-Fenster baut auf shell/Overlay (Portal, Escape, Fokusfalle), Schließen mit Symbol + Wort, ErrorBoundary", () => {
    const s = read("components/room/RoomWindowGlass.tsx");
    expect(s).toMatch(/<Overlay /);
    expect(s).toMatch(/<ErrorBoundary>\{children\}<\/ErrorBoundary>/);
    expect(s).toMatch(/<Glyph name="x"[\s\S]*t\("common\.close"\)/);
    expect(read("components/shell/Overlay.tsx")).toMatch(/useEscapeKey/);
  });
  it("Notizen/Pause/Bearbeiten teilen die Logik (keine zweite Kopie der API-Aufrufe)", () => {
    const glass = read("components/room/RoomWindowGlass.tsx") + read("components/room/RoomEditGlass.tsx");
    expect(glass).not.toMatch(/\bapi\(|fetch\(/);
    expect(glass).toMatch(/HkNoteThread/);
    expect(read("components/room/RoomEditGlass.tsx")).toMatch(/useRoomEdit\(/);
    expect(read("components/RoomEditPanel.tsx")).toMatch(/useRoomEdit\(/);
    expect(read("components/lists/LiveRoomModal.tsx")).toMatch(/usePauseAction\(/);
  });
  it("Schnellsuche im Kopf: Glas nur auf Glas-Seiten", () => {
    expect(read("components/AppShell.tsx")).toMatch(/<GlassMode on=\{!legacy\}>\s*<RoomDetailModal/);
  });
});
