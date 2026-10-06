import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { loadList, parseList } from "@/lib/import/readFile";

async function xlsx(rows: (string | number | Date)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Departures");
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("Excel/CSV", () => {
  it("liest Departures aus XLSX (Datumszellen, Zimmer als Zahl) und erkennt den Typ am Dateinamen", async () => {
    const bytes = await xlsx([
      ["Room No.", "Name", "Arr. Date", "Dep. Date", "Adl.", "Chl.", "Rms", "Nts", "Res. Status", "Balance"],
      [4, "Testfrau, Anna Mrs.", new Date("2018-05-15"), new Date("2018-05-17"), 1, 0, 1, 2, "CKIN", 371],
      ["101", "Demo, Jonas Mr.", new Date("2018-05-15"), new Date("2018-05-16"), 1, 0, 1, 1, "DUOT", 157.2],
    ]);
    const list = await loadList("departures.xlsx", bytes);
    expect(list.type).toBe("DEPARTURES");
    const r = parseList("DEPARTURES", list, { today: "2018-05-16" });
    expect(r.rows.map((x: { room: string }) => x.room)).toEqual(["004", "101"]);
    expect(r.rows[0]).toMatchObject({ arrDate: "2018-05-15", depDate: "2018-05-17", nights: 2, status: "CKIN" });
    expect(r.reportDate).toBe("2018-05-16"); // aus dem Formular, nicht aus der Datei
    expect(JSON.stringify(r)).not.toContain("371");
  });

  it("liest Traces aus CSV (Windows-1252, Semikolon)", async () => {
    const csv = Buffer.from("Zimmer;Datum;Text\n301;05-16-18;Twin Bett für Gast\n", "latin1");
    const list = await loadList("traces.csv", new Uint8Array(csv));
    expect(list.type).toBe("TRACES");
    expect(parseList("TRACES", list).rows[0]).toMatchObject({ room: "301", date: "2018-05-16" });
  });

  it("lehnt andere Dateitypen und zu große Dateien ab", async () => {
    await expect(loadList("liste.docx", new Uint8Array([1, 2, 3]))).rejects.toThrow("nicht unterstützt");
    await expect(loadList("x.csv", new Uint8Array(11 * 1024 * 1024))).rejects.toThrow("10 MB");
  });
});

describe("parseList bei PDFs", () => {
  it("das Formular-Datum ersetzt nie das Druckdatum, warnt aber bei veralteter Liste", async () => {
    const { buildForecastPdf } = await import("./fixtures/opera/build");
    const list = await loadList("forecast.pdf", await buildForecastPdf());
    const stale = parseList("FORECAST", list, { today: "2026-10-06" });
    expect(stale.rows).toHaveLength(23); // ab Druckdatum 22.09., nicht ab 06.10.
    expect(stale.issues.map((i) => i.code)).toContain("LIST_NOT_TODAY");
    const fresh = parseList("FORECAST", list, { today: "2026-09-22" });
    expect(fresh.issues.map((i) => i.code)).not.toContain("LIST_NOT_TODAY");
  });
});
