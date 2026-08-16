/**
 * OPTIONAL ML hook — per-room cleaning-time prediction (Optii-style).
 *
 * Current implementation is a transparent BASELINE: average minutes by room
 * type, adjusted for stay length and checkout vs. stayover service.
 *
 * TODO(ml): swap this baseline for a trained regression model
 * (features: room type, stay length, occupancy, guest profile, historical
 * per-attendant cleaning times from the AuditLog table). The function
 * signature is intentionally stable so the caller never changes.
 */

export interface CleaningPredictionRoom {
  type: string; // STANDARD | DELUXE | JUNIOR_SUITE | SUITE | PENTHOUSE
  isCheckoutToday: boolean;
  baseCleanMinutes?: number;
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

export function predictCleaningMinutes(room: CleaningPredictionRoom, guest: GuestProfile = {}): number {
  let minutes = room.baseCleanMinutes ?? BASE_MINUTES_BY_TYPE[room.type] ?? 30;

  // Checkout (departure) cleans take longer than stayover service.
  minutes *= room.isCheckoutToday ? 1.3 : 0.7;

  // Longer stays accumulate more work (capped).
  const nights = Math.max(1, guest.stayLengthNights ?? 1);
  minutes *= 1 + Math.min(nights - 1, 6) * 0.04;

  // Occupancy adds linen/amenity volume.
  const pax = (guest.adults ?? 2) + (guest.children ?? 0);
  if (pax > 2) minutes *= 1 + (pax - 2) * 0.08;

  return Math.round(minutes);
}
