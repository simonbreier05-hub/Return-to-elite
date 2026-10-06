import type { DateFormatId } from "./types";

/**
 * Layout-Profil je Listentyp. Wird (später) pro Hotel in ImportMapping
 * gespeichert — Opera Cloud kann andere Layouts liefern. Hier stehen die
 * Standardwerte für die Opera-Listen (Demo-Hotel und Hotel de Rome).
 */
export interface ImportMappingConfig {
  version: number;
  /** Bevorzugtes Datumsformat (nur Vorbelegung — mehrdeutige Werte werden nie geraten). */
  dateFormat: DateFormatId;
  /** Bekannte Reservierungsstatus (Res. Status). */
  statusCodes: string[];
  /** Anreden, die vom Namen abgetrennt werden. */
  salutations: string[];
  titles: string[];
  /** Abkürzungen für VIP-Codes (Zeile 2 der Arrivals / Spalte VIP Code). */
  vipPattern: string;
  /** Spaltenreihenfolge der Forecast-Zahlen (nach dem Datum). */
  forecastColumns: string[];
}

export const DEFAULT_STATUS_CODES = ["RESV", "CKIN", "DUOT", "INHS", "CHKD", "DUEIN", "DUE"];

export const DEFAULT_MAPPING: ImportMappingConfig = {
  version: 1,
  dateFormat: "MDY",
  statusCodes: DEFAULT_STATUS_CODES,
  salutations: ["Herr", "Frau", "Mr.", "Mrs.", "Ms.", "Mr", "Mrs", "Ms", "Hr.", "Fr."],
  titles: ["Dr.", "Prof.", "Dr", "Prof"],
  vipPattern: "^(VIP|V)\\d*$",
  forecastColumns: [
    "totalOcc", "arrRooms", "compRooms", "houseUse",
    "dedIndiv", "nonDedIndiv", "dedGroup", "nonDedGroup",
    "occPct", "roomRevenue", "averageRate",
    "depRooms", "dayUse", "noShow", "ooo", "persons",
  ],
};

/** Ab so vielen unbekannten Zimmern (Anteil) wird nichts übernommen. */
export const UNKNOWN_ROOM_CRITICAL_RATIO = 0.2;
/** Departures sollen mindestens so viele Tage ab heute abdecken, sonst Hinweis. */
export const DEPARTURES_MIN_HORIZON_DAYS = 30;
/** Erlaubte Abweichung Occ.% vs. berechnet (Prozentpunkte), sonst Warnung. */
export const FORECAST_OCC_TOLERANCE_PCT = 1.0;
/** Standard-Zimmeranzahl für die Forecast-Prüfung (Hotel de Rome laut Forecast: 145). */
export const DEFAULT_ROOM_INVENTORY = 145;
