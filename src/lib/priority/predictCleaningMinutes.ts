/**
 * OPTIONAL ML hook — per-room cleaning-time prediction (Optii-style).
 *
 * Planung L1 (Meeting 13.11.2026): the baseline is **credit × minutes per credit** (1 credit = 40 min by default,
 * Setting `minutesPerCredit`) whenever the room's credit is known — the same for every kind of clean. The old rule
 * "stayover = 0.7 × departure" (and the 1.3 checkout bonus) is gone on purpose. Without a credit the per-type table
 * below is the fallback, adjusted for stay length and occupancy.
 *
 * TODO(ml): swap this baseline for a trained regression model
 * (features: room type, stay length, occupancy, guest profile, historical
 * per-attendant cleaning times from the AuditLog table). The function
 * signature is intentionally stable so the caller never changes.
 */
import { creditMinutes } from "@/lib/rooms/roomCredit";

export interface CleaningPredictionRoom {
  type: string; // STANDARD | DELUXE | JUNIOR_SUITE | SUITE | PENTHOUSE
  isCheckoutToday: boolean;
  baseCleanMinutes?: number;
  /** Credit des Zimmers (Zimmerliste v2.1). Gesetzt = Zeit = Credit × minutesPerCredit. */
  credit?: number | null;
}

export interface GuestProfile {
  stayLengthNights?: number;
  adults?: number;
  children?: number;
}

const BASE_MINUTES_BY_TYPE: Record<string, number> = {
  CLASSIC: 25,
  SUPERIOR: 28,
  DELUXE: 32,
  JUNIOR_SUITE: 40,
  SUITE: 55,
  PENTHOUSE: 80,
};

/** Standard „Minuten je Credit“, falls der Aufrufer keinen Hauswert mitgibt (gleich DEFAULT_SETTINGS.minutesPerCredit). */
export const DEFAULT_MINUTES_PER_CREDIT = 40;

export function predictCleaningMinutes(room: CleaningPredictionRoom, guest: GuestProfile = {}, minutesPerCredit = DEFAULT_MINUTES_PER_CREDIT): number {
  if (typeof room.credit === "number" && Number.isFinite(room.credit) && room.credit > 0) {
    return creditMinutes(room.credit, minutesPerCredit);
  }

  let minutes = room.baseCleanMinutes ?? BASE_MINUTES_BY_TYPE[room.type] ?? 30;

  // Longer stays accumulate more work (capped).
  const nights = Math.max(1, guest.stayLengthNights ?? 1);
  minutes *= 1 + Math.min(nights - 1, 6) * 0.04;

  // Occupancy adds linen/amenity volume.
  const pax = (guest.adults ?? 2) + (guest.children ?? 0);
  if (pax > 2) minutes *= 1 + (pax - 2) * 0.08;

  return Math.round(minutes);
}
