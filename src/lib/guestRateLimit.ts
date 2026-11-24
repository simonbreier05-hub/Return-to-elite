import { now as clockNow } from "@/lib/clock";
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

/**
 * S1: zusätzlich eine Obergrenze je Zimmer-Code über alle Geräte/IPs — ein fotografierter Code kann so auch mit
 * wechselnden Adressen nicht beliebig viele Anfragen erzeugen.
 */
export const GUEST_ROOM_LIMIT_PER_HOUR = 20;

/**
 * F9 (A6): Aufheben/Zurücknehmen (DND aufheben, Green zurücknehmen) wird nie begrenzt — sonst bliebe ein Zimmer
 * ungereinigt, weil der Gast vorher zu viel getippt hat.
 */
export const UNLIMITED_GUEST_ACTIONS = new Set(["dnd-cancel", "green-cancel"]);

/**
 * F9 (A6): Grenze `guestRateLimitPerHour` (Einstellung, Standard 5) gilt **je Aktion** und Gerät (IP); dazu bleibt die
 * Obergrenze je Zimmer über alle Aktionen und Geräte (20/Stunde). `action` leer = alle Aktionen zusammen (Alt-Aufrufer).
 */
export async function checkGuestRateLimit(roomId: string, ip: string, now: Date = clockNow(), action?: string): Promise<RateLimitResult> {
  if (action && UNLIMITED_GUEST_ACTIONS.has(action)) return { ok: true };
  const { guestRateLimitPerHour: limit } = await getSettings();
  const nowMs = now.getTime();
  const windowStart = nowMs - WINDOW_MS;
  const ipKey = action ? `${roomId}:${ip}:${action}` : `${roomId}:${ip}`;
  const roomKey = `room:${roomId}`;
  const recentIp = (hits.get(ipKey) ?? []).filter((t) => t > windowStart);
  const recentRoom = (hits.get(roomKey) ?? []).filter((t) => t > windowStart);

  const blocked = recentIp.length >= limit ? recentIp : recentRoom.length >= GUEST_ROOM_LIMIT_PER_HOUR ? recentRoom : null;
  hits.set(ipKey, recentIp);
  hits.set(roomKey, recentRoom);
  if (blocked) return { ok: false, retryAfterSeconds: Math.ceil((blocked[0] + WINDOW_MS - nowMs) / 1000) };

  recentIp.push(nowMs);
  recentRoom.push(nowMs);
  return { ok: true };
}

/** Test-only: clears all counters so tests don't leak state into each other. */
export function __resetGuestRateLimitForTests(): void {
  hits.clear();
}
