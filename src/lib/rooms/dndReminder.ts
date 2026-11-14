/**
 * Betrieb L2 (Punkt 4, Meeting 13.11.2026): Zimmer mit „Bitte nicht stören“, das ab `dndReminderHour` (Setting, Standard
 * 12 Uhr Berlin) noch nicht gereinigt ist → Erinnerung „Karte ans Zimmer hängen – nicht gereinigt“ an die Housekeeperin,
 * Supervisor der Etage sieht den Zustand. Rein, ohne DB — der Ticker (`runEscalations`) und die Listen (`loadRoomRows`)
 * lesen dieselbe Regel.
 */
export interface DndReminderInput {
  /** DND aktiv: Gastwunsch DND offen oder Status BLOCKED mit Grund DND. */
  dnd: boolean;
  status: string;
  /** Hat das Zimmer heute Reinigung (Tagesplan-Art ≠ reine Anreise)? */
  toClean: boolean;
}

const DONE = new Set(["CLEAN", "INSPECTED"]);

export function berlinHour(now: Date): number {
  return Number(now.toLocaleString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }));
}

export function dndReminderDue(r: DndReminderInput, now: Date, reminderHour: number): boolean {
  return r.dnd && r.toClean && !DONE.has(r.status) && berlinHour(now) >= reminderHour;
}
