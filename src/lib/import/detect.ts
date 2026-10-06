import type { ImportType } from "@/lib/domain";
import type { PdfLine } from "./types";

/** Listentyp automatisch erkennen: erst Inhalt (Titel der Liste), dann Dateiname. null = nachfragen. */
export function detectListType(lines: PdfLine[], fileName = ""): ImportType | null {
  const head = lines.slice(0, 12).map((l) => l.text);
  const has = (re: RegExp) => head.some((t) => re.test(t));
  if (has(/Arrivals:?\s*Detailed/i)) return "ARRIVALS";
  if (has(/History and Forecast/i)) return "FORECAST";
  if (has(/^Departures?$/i)) return "DEPARTURES";
  if (has(/^Traces$/i)) return "TRACES";
  const n = fileName.toLowerCase();
  if (/arriv|res_detail/.test(n)) return "ARRIVALS";
  if (/depart/.test(n)) return "DEPARTURES";
  if (/forecast|history/.test(n)) return "FORECAST";
  if (/trace/.test(n)) return "TRACES";
  return null;
}
