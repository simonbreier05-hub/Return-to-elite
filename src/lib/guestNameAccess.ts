import type { Role } from "@/lib/domain";

/**
 * F9 (A1): Wer volle Gastnamen aus Mitarbeiter-APIs bekommt. Front Office, Supervisor und Duty Manager sehen Namen;
 * Ausflüge (Name + Notiz) zusätzlich der Concierge. Housekeeper sehen bei Anreisen weiter nur den Kurznamen
 * (`shortGuestName`), alle anderen Rollen gar keinen Namen.
 */
export const GUEST_NAME_ROLES: Role[] = ["front_office", "supervisor", "duty_manager"];
export const EXCURSION_ROLES: Role[] = ["concierge", "front_office", "supervisor", "duty_manager"];

export const canSeeGuestNames = (role: Role) => GUEST_NAME_ROLES.includes(role);
export const canSeeExcursionDetails = (role: Role) => EXCURSION_ROLES.includes(role);

/** Ausflug ohne Gastname und Notiz (nur Zimmer + Zeitfenster) — für Rollen ohne Einsicht. */
export function excursionWithoutGuest<T extends { guestName?: string | null; note?: string | null }>(e: T): T {
  return { ...e, guestName: null, note: null };
}
