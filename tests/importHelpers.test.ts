import { describe, expect, it } from "vitest";
import { parseTime, resolveDateFormat, toIso } from "@/lib/import/dates";
import { detectListType } from "@/lib/import/detect";
import { maskName, parseGuestName } from "@/lib/import/names";
import { roomIssues } from "@/lib/import/store";
import type { PdfLine } from "@/lib/import/types";

const line = (text: string): PdfLine => ({ page: 1, y: 0, segments: [text], text });

describe("Datumsformat", () => {
  it("Wert > 12 macht das Format eindeutig", () => {
    expect(resolveDateFormat(["05-16-18", "05-10-18"])).toMatchObject({ format: "MDY", via: "unique" });
    expect(resolveDateFormat(["16/05/18", "10/05/18"])).toMatchObject({ format: "DMY" });
  });
  it("beide Lesarten gültig → mehrdeutig, nie raten; Bestätigung löst auf", () => {
    const r = resolveDateFormat(["05-10-18", "05-11-18"]);
    expect(r.format).toBeNull();
    expect(r.readings).toEqual({ MDY: { min: "2018-05-10", max: "2018-05-11" }, DMY: { min: "2018-10-05", max: "2018-11-05" } });
    expect(resolveDateFormat(["05-10-18", "05-11-18"], { confirmed: "DMY" })).toMatchObject({ format: "DMY", via: "confirmed" });
  });
  it("Wochentag entscheidet (Mo 05/10/26 = 5. Oktober)", () => {
    expect(resolveDateFormat(["05/10/26"], { weekdays: ["Mon"] })).toMatchObject({ format: "DMY", via: "weekday" });
    expect(resolveDateFormat(["05/10/26"], { weekdays: ["Sun"] })).toMatchObject({ format: "MDY", via: "weekday" });
  });
  it("ungültige Daten", () => {
    expect(toIso("02-30-18", "MDY")).toBeNull();
    expect(toIso("13-01-18", "MDY")).toBeNull();
  });
});

describe("Uhrzeit", () => {
  it.each([["02:13 AM", "02:13"], ["*11:31 PM", "23:31"], ["12:05 AM", "00:05"], ["12:30 PM", "12:30"], ["*04:30 AN", "04:30"], ["16:45", "16:45"]])("%s", (i, o) => {
    expect(parseTime(i)).toBe(o);
  });
  it("Unsinn → null", () => { expect(parseTime("25:00")).toBeNull(); expect(parseTime("abc")).toBeNull(); });
});

describe("Gastname", () => {
  it("Nachname, Vorname Anrede", () => expect(parseGuestName("Testfrau, Anna Mrs.")).toMatchObject({ lastName: "Testfrau", salutation: "Mrs.", title: null }));
  it("Anrede Titel Vorname Nachname", () => expect(parseGuestName("Herr Dr. Hans Beispiel")).toMatchObject({ lastName: "Beispiel", salutation: "Herr", title: "Dr." }));
  it("unbekanntes Muster → Nachname als Fallback, keine Anrede", () => expect(parseGuestName("Probe")).toMatchObject({ lastName: "Probe", salutation: null }));
  it("maskiert", () => expect(maskName("Testfrau")).toBe("T•••••••"));
});

describe("Listentyp", () => {
  it("aus dem Inhalt", () => {
    expect(detectListType([line("Arrivals: Detailed")])).toBe("ARRIVALS");
    expect(detectListType([line("Departures")])).toBe("DEPARTURES");
    expect(detectListType([line("History and Forecast")])).toBe("FORECAST");
    expect(detectListType([line("Traces")])).toBe("TRACES");
  });
  it("sonst Dateiname, sonst nachfragen", () => {
    expect(detectListType([], "res_detail.pdf")).toBe("ARRIVALS");
    expect(detectListType([], "scan.pdf")).toBeNull();
  });
});

describe("Unbekannte Zimmer", () => {
  const known = new Set(["101", "102", "103", "104", "105", "106", "107", "108", "109", "110"]);
  it("einzelne → Warnung", () => {
    expect(roomIssues(["101", "102", "103", "104", "105", "106", "107", "108", "109", "999"], known)[0].severity).toBe("WARNING");
  });
  it("mehr als 20 % → kritisch", () => {
    expect(roomIssues(["101", "102", "801", "802", "803"], known)[0].severity).toBe("CRITICAL");
  });
  it("alle bekannt → keine Meldung", () => expect(roomIssues(["101"], known)).toEqual([]));
});
