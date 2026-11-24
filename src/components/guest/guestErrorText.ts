import { ApiError } from "@/components/api";

/**
 * F9 (A6): Fehler der Gast-API immer in der Gastsprache — über `code`/Status, nie über den (englischen) Servertext.
 * `t` ist die Übersetzungsfunktion des Gastbildschirms (`src/lib/guestI18n/`).
 */
type ErrorKey = "error.generic" | "error.rateLimited" | "error.unavailable";
export function guestErrorText(e: unknown, t: (key: ErrorKey) => string): string {
  if (e instanceof ApiError) {
    if (e.code === "GUEST_RATE_LIMITED" || e.status === 429) return t("error.rateLimited");
    if (e.status === 404) return t("error.unavailable");
  }
  return t("error.generic");
}
