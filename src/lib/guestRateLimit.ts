import type { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";

const WINDOW_MS = 60 * 60 * 1000;

/**
 * In-memory sliding-window counter, keyed by room+IP, shared across every
 * guest write action (DND/clean-request/defect/contact/note) — Prompt G2
 * Teil 2 caps these together, not per endpoint. Deliberately not
 * DB-backed: this is abuse throttling, not an audit trail, and StayClean
 * runs as a single Railway service, so an in-process Map is enough — it
 * just resets on restart/redeploy, which is fine for this purpose.
 */
const hits = new Map<string, number[]>();

export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function checkGuestRateLimit(roomId: string, ip: string, now: Date = new Date()): Promise<RateLimitResult> {
  const { guestRateLimitPerHour: limit } = await getSettings();
  const key = `${roomId}:${ip}`;
  const nowMs = now.getTime();
  const windowStart = nowMs - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((recent[0] + WINDOW_MS - nowMs) / 1000) };
  }

  recent.push(nowMs);
  hits.set(key, recent);
  return { ok: true };
}

/** Test-only: clears all counters so tests don't leak state into each other. */
export function __resetGuestRateLimitForTests(): void {
  hits.clear();
}
