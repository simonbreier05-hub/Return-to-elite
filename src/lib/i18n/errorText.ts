import { ApiError, NetworkError } from "@/components/api";
import { SOURCE_DICTS } from "./core";
import type { TKey } from "./translations";

type T = (key: TKey, vars?: Record<string, string | number>) => string;

/**
 * Fehlermeldung für die Oberfläche in der Sprache des Lesers (Prompt K1): Der Server schickt neben dem Klartext
 * einen Code (`{ error, code }`); gibt es `errors.<code>`, wird übersetzt, sonst der Klartext gezeigt.
 */
export function errorText(e: unknown, t: T, fallback: TKey = "errors.GENERIC"): string {
  if (e instanceof NetworkError) return t("errors.NETWORK");
  if (e instanceof ApiError && e.code && `errors.${e.code}` in SOURCE_DICTS.de) return t(`errors.${e.code}` as TKey);
  if (e instanceof Error && e.message) return e.message;
  return t(fallback);
}
