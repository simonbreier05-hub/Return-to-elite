import type { TKey } from "@/lib/i18n/translations";

/**
 * F3 Teil 1 (K4, H10): Rückfragetext „Gast laut Front Office noch im Zimmer (Late Check-out 15:00). Trotzdem …?“ — rein,
 * client-sicher; die Regel selbst steht in `src/lib/rooms/previousGuest.ts` (Server). Ohne Gastnamen.
 */
export function guestStillInText(t: (k: TKey, v?: Record<string, string | number>) => string, n: string, lateCheckout?: string | null): string {
  return lateCheckout ? t("prevGuest.stillInLate", { n, time: lateCheckout }) : t("prevGuest.stillIn", { n });
}
