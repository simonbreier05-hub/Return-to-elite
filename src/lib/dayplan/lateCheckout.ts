/**
 * Betrieb L2 (Punkt 3, Meeting 13.11.2026): Late Check-out. Quelle: Abreisezeit im Departures-Report (`DepartureRow.depTime`)
 * oder Handeingabe des Front Office (`DayRoomPlan.lateCheckoutManual` — der nächste Import überschreibt sie nie).
 * „Spät“ = nach `lateCheckoutAfterMinutes` (Setting, Standard 660 = 11:00, Entscheidung 14.11.). Rein, ohne DB.
 */
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const minutesOf = (hhmm: string): number | null => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Abreisezeit aus dem Report → Late Check-out („HH:MM“) oder null, wenn nicht später als die Grenze. */
export function lateCheckoutFrom(depTime: string | null | undefined, afterMinutes: number): string | null {
  if (!depTime) return null;
  const m = minutesOf(depTime);
  return m !== null && m > afterMinutes ? depTime : null;
}

/** Wert beim Merge: Handeingabe bleibt stehen, sonst gilt der Report. */
export function mergedLateCheckout(old: { lateCheckout: string | null; lateCheckoutManual: boolean } | undefined, fromReport: string | null): { lateCheckout: string | null; lateCheckoutManual: boolean } {
  if (old?.lateCheckoutManual) return { lateCheckout: old.lateCheckout, lateCheckoutManual: true };
  return { lateCheckout: fromReport, lateCheckoutManual: false };
}

export const isValidHHMM = (s: string) => HHMM.test(s);
