/**
 * Datum, Uhrzeit, Zahlen nach Oberflächensprache (Intl), immer mit lateinischen Ziffern und Hotel-Zeitzone.
 * Zimmernummern und Etagen sind keine Zahlen im Sinne dieser Helfer — sie werden nie formatiert.
 */
import { intlLocale } from "./languages";

export const HOTEL_TZ = "Europe/Berlin";

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

export function formatTime(lang: string, d: Date | string | number, opts: { seconds?: boolean; timeZone?: string } = {}): string {
  return toDate(d).toLocaleTimeString(intlLocale(lang), {
    hour: "2-digit",
    minute: "2-digit",
    ...(opts.seconds ? { second: "2-digit" } : {}),
    timeZone: opts.timeZone ?? HOTEL_TZ,
  });
}

export function formatDate(lang: string, d: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(d).toLocaleDateString(intlLocale(lang), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: HOTEL_TZ, ...opts });
}

export function formatDateTime(lang: string, d: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  return toDate(d).toLocaleString(intlLocale(lang), { dateStyle: "short", timeStyle: "short", timeZone: HOTEL_TZ, ...opts });
}

export function formatNumber(lang: string, n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(lang), opts).format(n);
}

// ── Aktuelle Oberflächensprache für Helfer außerhalb von Komponenten (setzt der LocaleProvider) ──
let active = "de";
export function setActiveLanguage(lang: string): void {
  active = lang;
}
export function activeLanguage(): string {
  return active;
}
/** „14:05“ in der aktuellen Sprache, Hotel-Zeitzone. */
export const hhmm = (d: Date | string | number) => formatTime(active, d);
/** Kurzes Datum + Uhrzeit in der aktuellen Sprache. */
export const dateTime = (d: Date | string | number, opts?: Intl.DateTimeFormatOptions) => formatDateTime(active, d, opts);
