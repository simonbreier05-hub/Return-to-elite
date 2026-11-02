/**
 * Wer sieht die Styleguide-Seite `/dev/styleguide`?
 * - immer in der Entwicklung (`NODE_ENV !== "production"`),
 * - im Build/Preview nur mit dem Schalter `ENABLE_STYLEGUIDE=1` (Railway-Variable am Preview-Service).
 * Eine Rolle `platform_admin` gibt es im Bestand nicht (ROLES in src/lib/domain.ts) — daher nur Env.
 */
export function styleguideEnabled(env: { NODE_ENV?: string; ENABLE_STYLEGUIDE?: string }): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.ENABLE_STYLEGUIDE === "1";
}
