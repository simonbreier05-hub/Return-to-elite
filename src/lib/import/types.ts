import type { ImportSeverity, ImportType } from "@/lib/domain";

/** Ein Befund beim Auslesen. `message` enthält nie Gastdaten (weder Namen noch Beträge). */
export interface ParseIssue {
  severity: ImportSeverity;
  code: string;
  message: string;
  page?: number;
  line?: number;
  room?: string;
}

/** Eine Zeile des PDF-Textes: `segments` sind die Zellen (große Lücke = neue Zelle). */
export interface PdfLine {
  page: number;
  y: number;
  segments: string[];
  text: string;
}

export interface GuestName {
  salutation: string | null; // Herr | Frau | Mr. | Mrs. | Ms. …
  title: string | null; // Dr. | Prof.
  lastName: string;
  /** Voller Name — nur für berechtigte Rollen anzeigen, M3 löscht ihn nachts. */
  fullName: string;
}

export interface TraceEntry {
  code: string;
  date: string; // YYYY-MM-DD
  text: string;
}

// Whitelist (docs/opera-import.md): nur diese Felder verlassen den Parser.
export interface DepartureRow {
  room: string;
  guest: GuestName;
  arrDate: string;
  depDate: string;
  adults: number;
  children: number;
  nights: number;
  status: string | null;
  depTime: string | null; // HH:MM, 24 h
  vip: boolean;
}

export interface ArrivalRow {
  room: string;
  guest: GuestName;
  arrDate: string;
  depDate: string;
  arrTime: string | null; // HH:MM, 24 h
  adults: number;
  children: number;
  status: string | null;
  vip: boolean;
  traces: TraceEntry[];
}

export interface TraceRow {
  room: string;
  guest: GuestName | null;
  code: string;
  dept: string | null;
  date: string;
  text: string;
}

export interface ForecastDayRow {
  date: string;
  occupiedRooms: number;
  arrivals: number;
  departures: number;
  occupancyPct: number;
  outOfOrder: number;
  dayUse: number;
  noShow: number;
  persons: number;
}

export type DateFormatId = "MDY" | "DMY";

export interface DateResolution {
  /** Gewähltes Format, null wenn mehrdeutig und nicht bestätigt. */
  format: DateFormatId | null;
  via: "unique" | "weekday" | "reportDate" | "confirmed" | "ambiguous";
  /** Nur bei Mehrdeutigkeit: früheste/späteste Lesart je Format, für die Vorschau. */
  readings?: Record<DateFormatId, { min: string; max: string }>;
}

export interface ParseResult<T> {
  type: ImportType;
  rows: T[];
  issues: ParseIssue[];
  /** Druckdatum aus dem Kopf (YYYY-MM-DD), falls lesbar. */
  reportDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  pagesSeen: number;
  pagesTotal: number | null;
  dates: DateResolution;
}

export interface ParseOptions {
  /** Bestätigtes Datumsformat (Nutzer hat in der Vorschau eine Lesart gewählt). */
  confirmedDateFormat?: DateFormatId;
  /** Heute (YYYY-MM-DD); Standard: Druckdatum der Liste. */
  today?: string;
  /** Der Tag, für den der Nutzer die Listen importiert (heute). Löst ein mehrdeutiges Datum nur auf, wenn das Druckdatum im Kopf genau in einer Lesart auf diesen Tag fällt. */
  expectedDate?: string;
  /** Zimmeranzahl für die Forecast-Plausibilitätsprüfung (Occ.% ≈ belegt ÷ (Anzahl − OOO)). */
  roomInventory?: number;
}
