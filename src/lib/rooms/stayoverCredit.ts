import type { SettingsShape } from "@/lib/domain";

/**
 * Credit-Faktor eines Zimmers im Zuteilungsvorschlag und in den Arbeitslisten (eine Definition für beide):
 * Abreise/Turn voll; Bleiber normal 0,5 (`stayoverFactor`); Bleiber mit Wäschewechsel voll (`stayoverLaundryFactor`).
 */
export function creditFactor(kind: "DEPARTURE" | "TURN" | "STAYOVER", laundryDue: boolean, s: Pick<SettingsShape, "stayoverFactor" | "stayoverLaundryFactor">): number {
  if (kind !== "STAYOVER") return 1;
  return laundryDue ? s.stayoverLaundryFactor : s.stayoverFactor;
}
