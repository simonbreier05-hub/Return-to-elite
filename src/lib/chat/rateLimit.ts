/** Höchstens so viele Nachrichten je Person im Zeitfenster (Missbrauchs-Bremse, im Speicher wie guestRateLimit). */
export const CHAT_RATE_LIMIT = 20;
export const CHAT_RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function checkChatRateLimit(userId: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const recent = (hits.get(userId) ?? []).filter((t) => t > now - CHAT_RATE_WINDOW_MS);
  if (recent.length >= CHAT_RATE_LIMIT) {
    hits.set(userId, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + CHAT_RATE_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}

/** Nur für Tests. */
export const resetChatRateLimit = () => hits.clear();
