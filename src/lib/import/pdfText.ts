import type { PdfLine } from "./types";

interface Item { str: string; x: number; y: number; w: number }

const SAME_LINE_TOL = 2.5; // pt
const GLUE_GAP = 1; // ≤ 1 pt → "1"+"LFAMIL" werden "1LFAMIL" (wie im Opera-Ausdruck)
const SEGMENT_GAP = 5; // > 5 pt → neue Zelle

/** Items einer Seite → Zeilen (oben nach unten) mit Zellen (links nach rechts). */
export function itemsToLines(items: Item[], page: number): PdfLine[] {
  const sorted = [...items].filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= SAME_LINE_TOL);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const segments: string[] = [];
    let prevEnd = -Infinity;
    for (const it of row) {
      const gap = it.x - prevEnd;
      if (segments.length && gap <= GLUE_GAP) segments[segments.length - 1] += it.str.trim();
      else if (segments.length && gap <= SEGMENT_GAP) segments[segments.length - 1] += " " + it.str.trim();
      else segments.push(it.str.trim());
      prevEnd = it.x + it.w;
    }
    return { page, y: row[0].y, segments, text: segments.join(" ") };
  }).sort((a, b) => b.y - a.y);
}

/**
 * Liest ein PDF mit Textebene zeilenweise. Läuft im Browser (pdfjs-dist) und
 * in Node (Tests, `legacy`-Build). Ein PDF ohne Text (Foto/Scan) → `[]`.
 * Das PDF wird nur im Arbeitsspeicher gehalten, nie gespeichert.
 */
export async function extractPdfLines(data: Uint8Array): Promise<PdfLine[]> {
  const isNode = typeof window === "undefined";
  const pdfjs = isNode
    ? await import("pdfjs-dist/legacy/build/pdf.mjs")
    : await import("pdfjs-dist");
  if (!isNode) {
    // Im Browser läuft pdf.js in einem Web-Worker (Datei bleibt im Browser, wird nirgends hochgeladen).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: data.slice(), useSystemFonts: true, verbosity: 0 }).promise;
  const out: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
    out.push(...itemsToLines(items, p));
  }
  await doc.loadingTask.destroy();
  return out;
}
