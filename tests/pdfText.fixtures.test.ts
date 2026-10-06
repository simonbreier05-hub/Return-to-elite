import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadList } from "@/lib/import/readFile";
import { extractPdfLines } from "@/lib/import/pdfText";

const DIR = join(__dirname, "fixtures/opera");
const FILES = ["arrivals_nachbau", "arrivals_nachbau_nur_seite1", "departures_nachbau", "forecast_nachbau", "traces_nachbau"];
const read = (n: string) => new Uint8Array(readFileSync(join(DIR, `${n}.pdf`)));

describe("PDF-Text der Test-PDFs (erfundene Daten)", () => {
  it.each(FILES)("%s: Text wird gelesen", async (n) => {
    const lines = await extractPdfLines(read(n));
    expect(lines.length).toBeGreaterThan(3);
  });

  it("funktioniert auch ohne async-Iteration von ReadableStream (Safari/WebKit)", async () => {
    const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
    const saved = proto[Symbol.asyncIterator];
    delete proto[Symbol.asyncIterator];
    try {
      expect((ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator]).toBeUndefined();
      for (const n of FILES) expect((await extractPdfLines(read(n))).length).toBeGreaterThan(3);
    } finally {
      if (saved) proto[Symbol.asyncIterator] = saved;
    }
  });

  it("kaputte Datei → verständliche Meldung", async () => {
    await expect(loadList("kaputt.pdf", new TextEncoder().encode("%PDF-1.4 kaputt"))).rejects.toThrow(/Datei konnte nicht gelesen werden/);
  });
});
