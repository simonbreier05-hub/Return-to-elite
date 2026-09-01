/**
 * Simple in-memory fixed-window rate limiter for the public guest routes
 * (see /guest/[roomToken]) — the only unauthenticated surface in the app.
 * Everything else is gated by `requireAuth`/`requireRole`, so nothing else
 * needs this.
 *
 * server.js runs one long-lived Node process (no serverless/edge fan-out),
 * so an in-memory Map is a valid store here — it resets on restart and does
 * not coordinate across instances, which is an accepted limit for "simple"
 * abuse protection, not a multi-instance rate limiter.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so the map doesn't grow unbounded across many distinct keys.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
}

/**
 * `key` should identify the caller (e.g. an IP address) — callers typically
 * combine it with a route name so different actions have independent limits.
 */
export function checkRateLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }

  if (existing.count >= opts.limit) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count++;
  return { ok: true };
}

/** Best-effort caller identity for a public route — never trust this for authorization. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
