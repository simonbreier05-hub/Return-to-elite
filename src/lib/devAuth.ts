/**
 * Password-less quick login — development convenience, and a deliberate
 * auth bypass. It must never be reachable on a real deployment.
 *
 * Two gates, and production has to be opened explicitly:
 *   - outside production it is on, because that is a developer's machine
 *   - in production it stays off unless ALLOW_DEV_LOGIN is literally "true"
 *
 * The escape hatch exists so a hosted demo (Railway) can be opened up on
 * purpose. Never set it on an instance holding real guest data: anyone with
 * the URL could sign in as the duty manager.
 */
export function devLoginEnabled(): boolean {
  if (process.env.ALLOW_DEV_LOGIN === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/** Shown in the UI so nobody mistakes an open instance for a secured one. */
export const DEV_LOGIN_WARNING =
  "Quick login is enabled — anyone can sign in as any role without a password.";
