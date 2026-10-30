import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFeed, classify, collapse, COLLAPSE_WINDOW_MS, onOwnFloors, orderFeed, PIN_WINDOW_MS, type RawFeedEvent } from "@/lib/supervisorFeed/rules";

const NOW = new Date("2026-10-30T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
let seq = 0;
const ev = (over: Partial<RawFeedEvent>): RawFeedEvent =>
  ({ id: `e${++seq}`, at: ago(5), action: "STATUS_CHANGE", toStatus: "IN_PROGRESS", roomId: "r305", roomNumber: "305", floor: 3, ...over });

describe("Feed: nur eigene Etagen", () => {
  const events = [ev({ floor: 3 }), ev({ floor: 4, roomId: "r405", roomNumber: "405" }), ev({ floor: 2, roomId: "r201", roomNumber: "201" })];
  it("filtert auf die zugewiesenen Etagen", () => {
    expect(onOwnFloors(events, [3]).map((e) => e.roomNumber)).toEqual(["305"]);
    expect(onOwnFloors(events, [2, 4]).map((e) => e.floor).sort()).toEqual([2, 4]);
  });
  it("keine Etagen = leerer Feed, nie das ganze Haus", () => {
    expect(onOwnFloors(events, [])).toEqual([]);
    expect(buildFeed(events, [], NOW, 30)).toEqual({ items: [], hasMore: false });
  });
});

describe("Feed: Ereignisarten", () => {
  it("Statuswechsel und Logbuch-Aktionen", () => {
    expect(classify({ action: "STATUS_CHANGE", toStatus: "CLEAN" })).toBe("FINISHED");
    expect(classify({ action: "STATUS_CHANGE", toStatus: "PICKUP" })).toBe("REWORK");
    expect(classify({ action: "WORK_PAUSED" })).toBe("PAUSED");
    expect(classify({ action: "DEFECT_REPORTED" })).toBe("DEFECT");
    expect(classify({ action: "GUEST_DND_REQUESTED" })).toBe("GUEST_DND_ON");
    expect(classify({ action: "NOTIFICATION:ETA_AT_RISK" })).toBe("PRIORITY_ETA");
    expect(classify({ action: "STATUS_CHANGE", toStatus: "DEFECT_REPORTED" })).toBeNull(); // kommt als DEFECT
    expect(classify({ action: "LOGIN" })).toBeNull();
  });
});

describe("Feed: Rauschen vermeiden", () => {
  it("gleiche Art + gleiches Zimmer im Zeitfenster → ein Eintrag mit Zähler", () => {
    const items = collapse([ev({ action: "WORK_PAUSED", at: ago(1) }), ev({ action: "WORK_PAUSED", at: ago(4) }), ev({ action: "WORK_PAUSED", at: ago(8) })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "PAUSED", count: 3, at: ago(1), firstAt: ago(8) });
  });
  it("außerhalb des Fensters oder anderes Zimmer → getrennt", () => {
    const gap = COLLAPSE_WINDOW_MS / 60_000 + 1;
    expect(collapse([ev({ action: "WORK_PAUSED", at: ago(1) }), ev({ action: "WORK_PAUSED", at: ago(1 + gap) })])).toHaveLength(2);
    expect(collapse([ev({ action: "WORK_PAUSED" }), ev({ action: "WORK_PAUSED", roomId: "r306", roomNumber: "306" })])).toHaveLength(2);
  });
  it("wichtig oben (nur frisch), sonst neueste zuerst", () => {
    const items = collapse([
      ev({ toStatus: "IN_PROGRESS", at: ago(1), roomId: "a", roomNumber: "301" }),
      ev({ action: "DEFECT_REPORTED", at: ago(10), roomId: "b", roomNumber: "302" }),
      ev({ action: "DEFECT_REPORTED", at: ago(PIN_WINDOW_MS / 60_000 + 20), roomId: "c", roomNumber: "303" }),
      ev({ toStatus: "CLEAN", at: ago(3), roomId: "d", roomNumber: "304" }),
    ]);
    expect(orderFeed(items, NOW).map((i) => i.roomNumber)).toEqual(["302", "301", "304", "303"]);
  });
  it("begrenzt mit hasMore", () => {
    const many = Array.from({ length: 35 }, (_, i) => ev({ at: ago(i), roomId: `x${i}`, roomNumber: String(300 + i) }));
    const page = buildFeed(many, [3], NOW, 30);
    expect(page.items).toHaveLength(30);
    expect(page.hasMore).toBe(true);
  });
  it("Gast: nie ein Name im Eintrag", () => {
    const [item] = collapse([ev({ action: "GUEST_DND_REQUESTED", actorRole: "guest", actorName: "Gast-System" })]);
    expect(item.actorName).toBeNull();
  });
});

describe("Feed-Lader: kein Freitext aus Logbuch/Meldungen", () => {
  const src = readFileSync(path.join(__dirname, "..", "..", "src", "lib", "supervisorFeed", "load.ts"), "utf8");
  it("liest keine Meldungstexte und gibt aus meta nur Enum-Werte weiter", () => {
    expect(src).not.toMatch(/message:\s*true/);
    expect(src).not.toMatch(/guestName/);
    expect(src).toMatch(/metaEnums/);
  });
});
