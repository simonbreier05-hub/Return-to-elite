import { describe, expect, it } from "vitest";
import { IMPORT_TYPES } from "@/lib/domain";
import { detectListType } from "@/lib/import/detect";
import { parseInHouse } from "@/lib/import/parsers";
import { missingLists, listsComplete, REQUIRED_LISTS } from "@/lib/import/readiness";
import { SubmitBatchSchema } from "@/lib/import/schema";
import type { PdfLine } from "@/lib/import/types";

const line = (segments: string[], y: number): PdfLine => ({ page: 1, y: -y, segments, text: segments.join(" ") });
// Erfundene Gäste; Datumsformat eindeutig (Tag 15 > 12)
const LIST: PdfLine[] = [
  line(["In House"], 0),
  line(["Printed", "10/15/2026"], 1),
  line(["Room", "Name", "Arrival", "Departure", "Adl", "Chl", "Rms", "Nts"], 2),
  line(["101", "Herr Dr. Testmann, Max", "10/13/2026", "10/17/2026", "2", "0", "1", "4"], 3),
  line(["102", "Mrs. Testfrau, Erika", "10/14/2026", "10/16/2026", "1", "1", "1", "2"], 4),
];

describe("Fünfte Liste: In House (Tagesbelegung)", () => {
  it("INHOUSE ist ein Listentyp wie die anderen vier", () => {
    expect(IMPORT_TYPES).toHaveLength(5);
    expect(IMPORT_TYPES).toContain("INHOUSE");
  });

  it("wird am Titel und am Dateinamen erkannt", () => {
    expect(detectListType(LIST)).toBe("INHOUSE");
    expect(detectListType([], "InHouse_Guests.pdf")).toBe("INHOUSE");
    expect(detectListType([], "departure_all.pdf")).toBe("DEPARTURES");
  });

  it("liest Zimmer, Daten, Personen und kürzt den Namen", () => {
    const r = parseInHouse(LIST);
    expect(r.type).toBe("INHOUSE");
    expect(r.rows.map((x) => x.room)).toEqual(["101", "102"]);
    expect(r.rows[0]).toMatchObject({ arrDate: "2026-10-13", depDate: "2026-10-17", adults: 2, children: 0, nights: 4 });
    expect(r.rows[1]).toMatchObject({ adults: 1, children: 1 });
    expect(r.reportDate).toBe("2026-10-15");
    expect(r.issues.filter((i) => i.severity === "CRITICAL")).toEqual([]);
  });

  it("leere/unlesbare Liste ist kritisch (wird nicht übernommen)", () => {
    expect(parseInHouse([]).issues.map((i) => i.code)).toContain("NO_TEXT");
    expect(parseInHouse([line(["In House"], 0), line(["Printed", "10/15/2026"], 1)]).issues.some((i) => i.severity === "CRITICAL")).toBe(true);
  });

  it("Server-Whitelist nimmt die Parser-Ausgabe an und lehnt Zusatzfelder ab", () => {
    const r = parseInHouse(LIST);
    const body = { type: "INHOUSE", fileHash: "a".repeat(64), reportDate: r.reportDate, periodFrom: null, periodTo: null, issues: [], rows: r.rows };
    expect(SubmitBatchSchema.safeParse(body).success).toBe(true);
    const bad = { ...body, rows: r.rows.map((x, i) => (i === 0 ? { ...x, creditCard: "4111111111111111" } : x)) };
    expect(SubmitBatchSchema.safeParse(bad).success).toBe(false);
  });
});

describe("Einreichungs-Gate: erst bei allen fünf Listen", () => {
  it("benötigt genau die fünf Typen", () => {
    expect([...REQUIRED_LISTS].sort()).toEqual(["ARRIVALS", "DEPARTURES", "FORECAST", "INHOUSE", "TRACES"]);
  });

  it("zwei, drei und vier von fünf reichen nicht und nennen die fehlenden", () => {
    expect(listsComplete({ DEPARTURES: true, ARRIVALS: true })).toBe(false);
    expect(missingLists({ DEPARTURES: true, ARRIVALS: true })).toEqual(["FORECAST", "TRACES", "INHOUSE"]);
    expect(missingLists({ DEPARTURES: 1, ARRIVALS: 1, FORECAST: 1, TRACES: 1 })).toEqual(["INHOUSE"]);
  });

  it("null (nicht übernommen) zählt als fehlend, alle fünf sind komplett", () => {
    const all = { FORECAST: { x: 1 }, DEPARTURES: { x: 1 }, ARRIVALS: { x: 1 }, TRACES: { x: 1 }, INHOUSE: null };
    expect(listsComplete(all)).toBe(false);
    expect(listsComplete({ ...all, INHOUSE: { x: 1 } })).toBe(true);
  });
});
