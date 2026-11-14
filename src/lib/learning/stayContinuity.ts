/**
 * Planung L1 (Regel 13, Meeting 13.11.2026): „Das System merkt sich, welche Housekeeperin bei welchem Aufenthalt war,
 * und schlägt bei Bleibern dieselbe Person vor“ — weich, jederzeit überschreibbar.
 *
 * Gespeichert wird dafür nichts Neues: Die Zuordnung wird aus vorhandenen Daten abgeleitet — Aufenthalt (`Stay.id`,
 * `checkIn`) + Logbuch (`AuditLog` STATUS_CHANGE → CLEAN, wer hat das Zimmer fertig gemeldet). Kein Gastname, kein Text,
 * nur Stay-Bezug (Zimmer-Id, Stay-Id, Person-Id). Rein, ohne DB — die Abfrage steht in `src/lib/autoplan/load.ts`.
 */

export interface StayRef {
  roomId: string;
  stayId: string;
  /** Anreisetag des Aufenthalts. */
  checkIn: Date;
}

export interface CleanEvent {
  roomId: string;
  userId: string;
  at: Date;
}

/**
 * Je Zimmer (Bleiber heute) die Kraft, die beim selben Aufenthalt zuletzt gereinigt hat. Zählt nur Reinigungen ab dem
 * Anreisetag und vor `before` (Beginn des Planungstags), nur von `attendantIds` (Housekeeper, keine Supervisoren).
 */
export function lastCleanerByStay(stays: StayRef[], events: CleanEvent[], before: Date, attendantIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const latest = new Map<string, number>();
  const stayBy = new Map(stays.map((s) => [s.roomId, s]));
  for (const e of events) {
    const s = stayBy.get(e.roomId);
    if (!s || !attendantIds.has(e.userId)) continue;
    const t = e.at.getTime();
    if (t < s.checkIn.getTime() || t >= before.getTime()) continue;
    if (t > (latest.get(e.roomId) ?? -Infinity)) {
      latest.set(e.roomId, t);
      out.set(e.roomId, e.userId);
    }
  }
  return out;
}
