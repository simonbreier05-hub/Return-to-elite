/** Zeit-Helfer für Europe/Berlin (Server läuft meist in UTC). Rein, ohne DB. */

/** "HH:MM" am Tag `date` (YYYY-MM-DD) in Berlin → UTC-Zeitpunkt. */
export function berlinToUtc(date: string, hhmm: string): Date {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

/** Kalendertag (YYYY-MM-DD) in Berlin. */
export function berlinDate(now: Date): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}
