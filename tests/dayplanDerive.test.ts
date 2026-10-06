import { describe, expect, it } from "vitest";
import { compareWithForecast, deriveDayPlan } from "@/lib/dayplan/derive";
import type { ArrivalRow, DepartureRow } from "@/lib/import/types";

const g = { salutation: "Mr.", title: null, lastName: "Test", fullName: "Test, X Mr." };
const dep = (room: string, arrDate: string, depDate: string, extra: Partial<DepartureRow> = {}): DepartureRow =>
  ({ room, guest: g, arrDate, depDate, adults: 1, children: 0, nights: 1, status: "CKIN", depTime: null, vip: false, ...extra });
const arr = (room: string, arrDate: string, depDate: string, extra: Partial<ArrivalRow> = {}): ArrivalRow =>
  ({ room, guest: g, arrDate, depDate, arrTime: "15:00", adults: 1, children: 0, status: "RESV", vip: false, traces: [], ...extra });

const DATE = "2026-10-06";
const run = (departures: DepartureRow[], arrivals: ArrivalRow[], extra = {}) =>
  deriveDayPlan({ date: DATE, departures, arrivals, linenCycleDays: 3, ...extra });
const typeOf = (r: ReturnType<typeof run>, room: string) => r.rooms.find((x) => x.room === room)?.cleaningType;

describe("deriveDayPlan", () => {
  const r = run(
    [
      dep("101", "2026-10-05", DATE, { status: "DUOT" }), // Abreise
      dep("102", "2026-10-04", DATE, { status: "DUOT" }), // Turn
      dep("201", "2026-10-03", "2026-10-09"), // Bleiber
      dep("202", "2026-10-06", "2026-10-08"), // Frühanreise, schon eingecheckt
      dep("301", "2026-10-06", "2026-10-07"), // Frühanreise, nur in Departures (Arrivals-Seite fehlt?)
    ],
    [arr("102", DATE, "2026-10-08"), arr("103", DATE, "2026-10-07", { vip: true, arrTime: "13:30" }), arr("202", DATE, "2026-10-08", { status: "CKIN", arrTime: "02:10" })],
  );

  it("klassifiziert alle Arten", () => {
    expect(typeOf(r, "101")).toBe("DEPARTURE");
    expect(typeOf(r, "102")).toBe("SAME_DAY_TURN");
    expect(typeOf(r, "201")).toBe("STAYOVER");
    expect(typeOf(r, "103")).toBe("ARRIVAL");
    expect(typeOf(r, "202")).toBe("ARRIVAL"); // heute angereist: keine Reinigung
    expect(typeOf(r, "999")).toBeUndefined();
  });

  it("Mehrtages-Bleiber: Nächte zählen ab Anreise", () => {
    expect(r.rooms.find((x) => x.room === "201")!.nights).toBe(3);
  });

  it("Turn übernimmt Anreisezeit und VIP des anreisenden Gastes", () => {
    const t = r.rooms.find((x) => x.room === "102")!;
    expect(t.eta).toBe("15:00");
    expect(r.rooms.find((x) => x.room === "103")).toMatchObject({ vip: true, eta: "13:30" });
  });

  it("Tageszahl: Abreisen (Turn einmal) + Bleiber; Anreisen und Abend-Belegung", () => {
    expect(r.figures).toEqual({ departures: 2, arrivals: 4, stayovers: 1, eveningOccupancy: 5, cleaningCount: 3 });
  });
});

describe("Wäschewechsel", () => {
  const stay = (arr_: string) => run([dep("201", arr_, "2026-10-12")], [], {});
  it("fällig nach 3 Tagen ab Anreise, nicht davor", () => {
    expect(stay("2026-10-04").rooms[0].laundryDue).toBe(false); // Tag 2
    expect(stay("2026-10-03").rooms[0].laundryDue).toBe(true); // Tag 3
  });
  it("Abhaken setzt den Zähler zurück; ein Wechsel vor der Anreise zählt nicht", () => {
    expect(run([dep("201", "2026-10-01", "2026-10-12")], [], { lastLinenChange: { "201": "2026-10-05" } }).rooms[0].laundryDue).toBe(false);
    expect(run([dep("201", "2026-10-04", "2026-10-12")], [], { lastLinenChange: { "201": "2026-10-01" } }).rooms[0].laundryDue).toBe(false);
    expect(run([dep("201", "2026-10-02", "2026-10-12")], [], { lastLinenChange: { "201": "2026-10-01" } }).rooms[0].laundryDue).toBe(true);
  });
  it("Abreise/Turn: nie 'fällig' (Vollreinigung ohnehin)", () => {
    expect(run([dep("101", "2026-10-01", DATE)], []).rooms[0].laundryDue).toBe(false);
  });
});

describe("Widersprüche", () => {
  it("unterschiedliche Abreise für denselben Aufenthalt → Warnung, Departures gilt", () => {
    const r = run([dep("201", "2026-10-03", "2026-10-09")], [arr("201", "2026-10-03", "2026-10-10")]);
    expect(r.issues.map((i) => i.code)).toContain("STAY_DATE_CONFLICT");
    expect(typeOf(r, "201")).toBe("STAYOVER");
  });
  it("überschneidende Aufenthalte im selben Zimmer → Warnung", () => {
    const r = run([dep("201", "2026-10-03", "2026-10-09"), dep("201", "2026-10-04", "2026-10-10")], []);
    expect(r.issues.map((i) => i.code)).toContain("ROOM_CONFLICT");
  });
});

describe("Forecast-Gegenprobe", () => {
  const figures = { departures: 10, arrivals: 12, stayovers: 50, eveningOccupancy: 62, cleaningCount: 60 };
  it("innerhalb der Toleranz: keine Meldung", () => {
    expect(compareWithForecast(figures, { date: DATE, occupiedRooms: 64, arrivals: 13, departures: 9 })).toEqual([]);
  });
  it("außerhalb: Warnung, nie kritisch", () => {
    const i = compareWithForecast(figures, { date: DATE, occupiedRooms: 90, arrivals: 12, departures: 10 });
    expect(i[0]).toMatchObject({ code: "FORECAST_MISMATCH", severity: "WARNING" });
    expect(i[0].message).toContain("Listen und Forecast passen nicht zusammen, bitte prüfen");
  });
  it("kein Forecast → Info", () => {
    expect(compareWithForecast(figures, null)[0].severity).toBe("INFO");
  });
});
