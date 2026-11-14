/**
 * Betrieb L2 (Punkt 2, Meeting 13.11.2026): „In Arbeit“ — der Supervisor sieht Startzeit, Laufzeit und geschätzte Restzeit
 * je Zimmer. Schätzung = Credit × Minuten je Credit (`creditMinutes`, Setting `minutesPerCredit`, Planung L1). Rein, ohne DB.
 * Eine Pause hält die Uhr nicht an (Pausen ändern nie den Status) — die Laufzeit ist Wanduhr-Zeit seit dem Start.
 */
export interface WorkProgress {
  /** ISO-Zeitpunkt des Starts (für die Anzeige über `hhmm`). */
  startedAt: string;
  elapsedMin: number;
  /** Geschätzte Restzeit in Minuten (≥ 0). */
  remainingMin: number;
  /** Länger als geschätzt: um so viele Minuten. 0 = im Plan. */
  overMin: number;
}

export function workProgress(startedAt: string | null | undefined, estMinutes: number, now: Date): WorkProgress | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const elapsedMin = Math.max(0, Math.floor((now.getTime() - start) / 60_000));
  const est = Math.max(0, Math.round(estMinutes));
  return { startedAt, elapsedMin, remainingMin: Math.max(0, est - elapsedMin), overMin: Math.max(0, elapsedMin - est) };
}
