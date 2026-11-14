/**
 * Betrieb L2 (Punkt 8, Meeting 13.11.2026): Mängel melden dürfen alle (auch Gäste) — **Fotos** sehen nur Technik,
 * Supervisor und Duty Manager. Eine Regel für die Auslieferung (`GET /api/uploads/...`) und für jede Antwort, die einen
 * Mangel mit `photoPath` enthält (z. B. `/api/rooms`): andere Rollen bekommen `photoPath: null`.
 */
export const PHOTO_ROLES = ["engineering", "supervisor", "duty_manager"] as const;

export const canSeeDefectPhotos = (role: string | null | undefined): boolean => (PHOTO_ROLES as readonly string[]).includes(role ?? "");

/** Entfernt Foto-Pfade aus Mängeln, wenn die Rolle sie nicht sehen darf. */
export function withoutPhotosFor<T extends { photoPath?: string | null }>(role: string | null | undefined, defects: T[]): T[] {
  return canSeeDefectPhotos(role) ? defects : defects.map((d) => ({ ...d, photoPath: null }));
}
