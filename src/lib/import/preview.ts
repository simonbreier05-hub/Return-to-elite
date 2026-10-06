import { maskName } from "./names";
import type { ParseResult } from "./types";

/** Vorschau für die Oberfläche: Zähler, Zeitraum, erste Zeilen — Namen maskiert. Client-sicher (kein Server-Import). */
export function buildPreview<T>(r: ParseResult<T>, sampleSize = 5) {
  const mask = (row: T) => {
    const { guest, ...rest } = row as T & { guest?: { salutation: string | null; title: string | null; lastName: string } | null };
    return guest
      ? { ...rest, guest: [guest.salutation, guest.title, maskName(guest.lastName)].filter(Boolean).join(" ") }
      : { ...rest, guest: "" };
  };
  return {
    type: r.type, count: r.rows.length, reportDate: r.reportDate, periodFrom: r.periodFrom, periodTo: r.periodTo,
    pages: { seen: r.pagesSeen, total: r.pagesTotal }, dateFormat: r.dates,
    sample: r.rows.slice(0, sampleSize).map(mask) as unknown as Record<string, unknown>[],
    critical: r.issues.filter((i) => i.severity === "CRITICAL").length,
    warnings: r.issues.filter((i) => i.severity === "WARNING").length,
  };
}

/** SHA-256 im Browser und in Node (Web Crypto). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
