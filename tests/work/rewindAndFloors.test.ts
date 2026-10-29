import { describe, expect, it } from "vitest";
import { rewindOption } from "@/lib/rooms/rewind";
import { computeDayNumbers, numbersConsistent, rowsOnFloors, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { roomChangeMessage } from "@/lib/rooms/notifyRoomChange";

const now = new Date("2026-10-29T09:00:00Z");
const today = "2026-10-29";
const mine = { status: "CLEAN", assignedToId: "hk1", assignedOn: today };
const last = (o: Partial<{ action: string; userId: string; fromStatus: string; toStatus: string; at: Date }> = {}) => ({
  action: "STATUS_CHANGE", userId: "hk1", fromStatus: "IN_PROGRESS", toStatus: "CLEAN", at: new Date(now.getTime() - 3 * 60_000), ...o,
});
const opt = (o: Partial<Parameters<typeof rewindOption>[0]> = {}) =>
  rewindOption({ role: "room_attendant", userId: "hk1", room: mine, today, last: last(), now, limitMinutes: 10, ...o });

describe("Status zurückspulen", () => {
  it("eigener letzter Schritt, eine Stufe, innerhalb des Zeitlimits", () => {
    expect(opt()).toEqual({ to: "IN_PROGRESS", until: new Date(now.getTime() + 7 * 60_000).toISOString() });
    expect(opt({ room: { ...mine, status: "IN_PROGRESS" }, last: last({ fromStatus: "DIRTY", toStatus: "IN_PROGRESS" }) })?.to).toBe("DIRTY");
  });
  it("nach Ablauf des Limits oder bei Limit 0 nicht mehr", () => {
    expect(opt({ last: last({ at: new Date(now.getTime() - 11 * 60_000) }) })).toBeNull();
    expect(opt({ limitMinutes: 0 })).toBeNull();
  });
  it("nur eigene Zimmer, nur eigene Schritte, nur Zimmermädchen", () => {
    expect(opt({ room: { ...mine, assignedToId: "hk2" } })).toBeNull();
    expect(opt({ room: { ...mine, assignedOn: "2026-10-28" } })).toBeNull();
    expect(opt({ last: last({ userId: "sup" }) })).toBeNull();
    expect(opt({ role: "supervisor" })).toBeNull();
  });
  it("kein zweites Zurückspulen und keine Freigabe/Sperre rückgängig", () => {
    expect(opt({ last: last({ action: "STATUS_REWIND" }) })).toBeNull();
    expect(opt({ room: { ...mine, status: "INSPECTED" }, last: last({ toStatus: "INSPECTED" }) })).toBeNull();
    expect(opt({ room: { ...mine, status: "IN_PROGRESS" }, last: last({ fromStatus: "BLOCKED", toStatus: "IN_PROGRESS" }) })).toBeNull();
    // Status hat sich seitdem geändert (z. B. Supervisor hat freigegeben)
    expect(opt({ room: { ...mine, status: "INSPECTED" } })).toBeNull();
  });
});

describe("Supervisor-Zahlen: Etagenfilter", () => {
  const row = (id: string, floor: number | undefined, kind: DayNumberRow["kind"], status = "DIRTY", assigned = false): DayNumberRow => ({
    id, number: id, floor, kind, laundryDue: false, nightsKnown: false, status, occupied: kind !== "DEPARTURE", assignedToId: assigned ? "hk" : null, assignedToday: assigned,
  });
  const rows = [
    row("301", 3, "DEPARTURE", "CLEAN", true), row("302", 3, "STAYOVER", "DIRTY", true), row("303", 3, "STAYOVER"),
    row("401", 4, "DEPARTURE"), row("402", 4, "ARRIVAL", "INSPECTED"), row("x", undefined, "TURN"),
  ];
  it("zählt nur Zimmer der gewählten Etagen mit derselben Zählregel", () => {
    const n = computeDayNumbers({ rows: rowsOnFloors(rows, [3]), inventory: 3 });
    expect({ toClean: n.toClean, assigned: n.assigned, cleaned: n.cleaned, open: n.open, occupied: n.occupied }).toEqual({ toClean: 3, assigned: 2, cleaned: 1, open: 1, occupied: 2 });
    expect(numbersConsistent(n)).toBe(true);
  });
  it("mehrere Etagen = Summe; Zeilen ohne Etage nie dabei; keine Etagen = nichts", () => {
    const house = computeDayNumbers({ rows, inventory: 145 });
    const both = computeDayNumbers({ rows: rowsOnFloors(rows, [3, 4]), inventory: 6 });
    expect(both.toClean).toBe(4);
    expect(house.toClean).toBe(both.toClean + 1);
    expect(rowsOnFloors(rows, [])).toEqual([]);
  });
});

describe("Meldung an das Zimmermädchen", () => {
  it("nur Zimmer, Etage und Art der Änderung", () => {
    expect(roomChangeMessage({ number: "305", floor: 3 }, "NOTE")).toBe("Zimmer 305 (Etage 3): neue Notiz.");
    expect(roomChangeMessage({ number: "305", floor: 3 }, "DND")).toBe("Zimmer 305 (Etage 3): Gast: Bitte nicht stören.");
  });
});
