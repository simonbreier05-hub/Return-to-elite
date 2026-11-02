import { describe, expect, it } from "vitest";
import { ROOM_STATUSES, ROOM_TASK_STATUSES } from "@/lib/domain";
import { translate, type TKey } from "@/lib/i18n/translations";
import { ICONS } from "@/lib/ui/icons";
import { MARKERS, MARKER_UI } from "@/lib/ui/markers";
import { CATEGORY_PILL_TONE, PILL_KINDS, PILL_TONE, pillTone } from "@/lib/ui/pill-tone";
import { CATEGORY_TILE, TILE_STATES, TILE_UI, TILE_UNASSIGNED_KEY, tileStateFor } from "@/lib/ui/room-tile";
import { ROOM_STATUS_UI, ROOM_TASK_STATUS_UI, STATUS_UI, UI_STATUSES, uiStatusForRoom } from "@/lib/ui/status";
import { styleguideEnabled } from "@/lib/ui/styleguideAccess";
import { TONES } from "@/lib/ui/tone";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";

const DAY_CATEGORIES: RoomDayCategory[] = ["DND", "SAME_DAY_TURN", "DEPARTURE", "ARRIVAL", "STAYOVER", "NONE"];
const translated = (k: TKey) => translate("de", k) !== k && translate("en", k) !== k;

describe("Zuordnungen des neuen Designs (src/lib/ui)", () => {
  it("jeder Zimmerstatus des Bestands hat einen Design-Status", () => {
    for (const s of ROOM_STATUSES) expect(UI_STATUSES, s).toContain(ROOM_STATUS_UI[s]);
    expect(Object.keys(ROOM_STATUS_UI).sort()).toEqual([...ROOM_STATUSES].sort());
  });
  it("jeder Aufgaben-Status hat einen Design-Status", () => {
    for (const s of ROOM_TASK_STATUSES) expect(UI_STATUSES).toContain(ROOM_TASK_STATUS_UI[s]);
  });
  it("jede Tages-Kategorie hat einen Kachelzustand und einen Pillen-Ton", () => {
    for (const c of DAY_CATEGORIES) {
      expect(TILE_STATES, c).toContain(CATEGORY_TILE[c]);
      expect(TONES, c).toContain(CATEGORY_PILL_TONE[c]);
    }
  });
  it("Status, Marker, Kacheln: Symbol aus der Liste, gültiger Ton, Text übersetzt", () => {
    for (const s of UI_STATUSES) {
      expect(ICONS[STATUS_UI[s].icon], s).toBeDefined();
      expect(TONES).toContain(STATUS_UI[s].tone);
      expect(translated(STATUS_UI[s].labelKey), s).toBe(true);
    }
    for (const m of MARKERS) {
      expect(ICONS[MARKER_UI[m].icon], m).toBeDefined();
      expect(TONES).toContain(MARKER_UI[m].tone);
      expect(translated(MARKER_UI[m].labelKey), m).toBe(true);
    }
    for (const t of TILE_STATES) {
      expect(ICONS[TILE_UI[t].icon], t).toBeDefined();
      expect(translated(TILE_UI[t].labelKey), t).toBe(true);
    }
    expect(translated(TILE_UNASSIGNED_KEY)).toBe(true);
  });
  it("entspricht der Spezifikation (Abschnitt 7)", () => {
    expect(STATUS_UI.open).toMatchObject({ icon: "circle", tone: "neutral" });
    expect(STATUS_UI.cleaning).toMatchObject({ icon: "refresh", tone: "accent" });
    expect(STATUS_UI.done).toMatchObject({ icon: "check", tone: "success" });
    expect(STATUS_UI.paused).toMatchObject({ icon: "pause", tone: "warning" });
    expect(STATUS_UI.dnd).toMatchObject({ icon: "moon", tone: "danger" });
    expect(STATUS_UI.defect).toMatchObject({ icon: "wrench", tone: "danger" });
    expect(STATUS_UI.rework).toMatchObject({ icon: "refresh", tone: "warning" });
    expect(MARKER_UI.arrival).toMatchObject({ icon: "log-in", tone: "accent" });
    expect(MARKER_UI.laundry).toMatchObject({ icon: "shirt", tone: "info" });
    expect(TILE_UI.stayover).toMatchObject({ icon: "bed-single", tone: "success" });
    expect(TILE_UI.empty.glass).toBe(false);
    expect(PILL_TONE.turn).toBe("accent");
    expect(PILL_TONE.tidy).toBe("neutral");
    expect(PILL_TONE.urgent).toBe("danger");
  });
  it("Pause überdeckt den Zimmerstatus nur, solange nicht fertig", () => {
    expect(uiStatusForRoom("IN_PROGRESS", { paused: true })).toBe("paused");
    expect(uiStatusForRoom("DIRTY", { paused: true })).toBe("paused");
    expect(uiStatusForRoom("CLEAN", { paused: true })).toBe("done");
    expect(uiStatusForRoom("PICKUP")).toBe("rework");
  });
  it("Kachel: ohne Tagesereignis + belegt = Belegt, sonst Kategorie", () => {
    expect(tileStateFor("NONE", true)).toBe("occupied");
    expect(tileStateFor("NONE")).toBe("empty");
    expect(tileStateFor("SAME_DAY_TURN", true)).toBe("departure");
  });
  it("unbekannte Pillen sind neutral, alle bekannten haben einen Ton", () => {
    expect(pillTone("irgendwas")).toBe("neutral");
    for (const k of PILL_KINDS) expect(TONES).toContain(PILL_TONE[k]);
  });
  it("Styleguide nur in Entwicklung oder mit ENABLE_STYLEGUIDE=1", () => {
    expect(styleguideEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(styleguideEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(styleguideEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(styleguideEnabled({ NODE_ENV: "production", ENABLE_STYLEGUIDE: "true" })).toBe(false);
    expect(styleguideEnabled({ NODE_ENV: "production", ENABLE_STYLEGUIDE: "1" })).toBe(true);
  });
});
