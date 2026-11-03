/** Kopfbereich des App-Rahmens (D1): Begrüßung nach Tageszeit (Hotelzeit Berlin), Vorname, Initialen. Reine Funktionen. */
import type { TKey } from "@/lib/i18n/translations";

/** Stunde in Berlin (0–23), unabhängig von der Zeitzone des Geräts. */
export function berlinHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(d));
}

/** Bis 10:59 „Guten Morgen“, bis 17:59 „Guten Tag“, sonst „Guten Abend“. */
export function greetingKey(d: Date): TKey {
  const h = berlinHour(d);
  if (h >= 4 && h < 11) return "appShell.greetingMorning";
  if (h >= 11 && h < 18) return "appShell.greetingDay";
  return "appShell.greetingEvening";
}

/** Vorname für die Begrüßung („Ingrid Berger“ → „Ingrid“). */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Initialen für den Avatar („Ingrid Berger“ → „IB“, „Maria“ → „MA“). */
export function initials(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
