import { createHmac } from "node:crypto";

/**
 * Dublettenschlüssel eines Traces (Zimmer|Code|Datum|Text) als HMAC. Der Klartext-Schlüssel
 * enthielte den Trace-Text; nach der Nachtlöschung (M3) darf dieser nirgends mehr stehen, der
 * Schlüssel muss aber bleiben, damit "erledigt" und "Hausmann-Aufgabe angelegt" nicht verloren gehen.
 * Mit Geheimnis (AUTH_SECRET) statt reinem Hash, damit kurze Texte nicht erraten werden können.
 */
export const TRACE_KEY_PREFIX = "h1:";

export function traceKey(room: string, code: string, date: string, text: string): string {
  const secret = process.env.AUTH_SECRET || "stayclean-dev-secret";
  return TRACE_KEY_PREFIX + createHmac("sha256", secret).update(`${room}|${code}|${date}|${text}`).digest("hex");
}

/** Klartext-Schlüssel aus der Zeit vor M3 (nur zum Auffinden und Umwandeln alter Zeilen). */
export const legacyTraceKey = (room: string, code: string, date: string, text: string) => `${room}|${code}|${date}|${text}`;
