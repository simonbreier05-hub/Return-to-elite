import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rateLimit";

describe("checkRateLimit — simple in-memory fixed-window limiter", () => {
  it("allows requests under the limit", () => {
    const key = "test:under-limit";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { limit: 5, windowMs: 60_000 }).ok).toBe(true);
    }
  });

  it("rejects the request that exceeds the limit, with a retryAfterMs", () => {
    const key = "test:over-limit";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { limit: 5, windowMs: 60_000 }).ok).toBe(true);
    }
    const sixth = checkRateLimit(key, { limit: 5, windowMs: 60_000 });
    expect(sixth.ok).toBe(false);
    expect(sixth.retryAfterMs).toBeGreaterThan(0);
  });

  it("a fresh window (new key) is independent of an exhausted one", () => {
    const exhausted = "test:exhausted";
    for (let i = 0; i < 3; i++) checkRateLimit(exhausted, { limit: 3, windowMs: 60_000 });
    expect(checkRateLimit(exhausted, { limit: 3, windowMs: 60_000 }).ok).toBe(false);

    const fresh = "test:fresh-key";
    expect(checkRateLimit(fresh, { limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const key = "test:short-window";
    expect(checkRateLimit(key, { limit: 1, windowMs: 20 }).ok).toBe(true);
    expect(checkRateLimit(key, { limit: 1, windowMs: 20 }).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(checkRateLimit(key, { limit: 1, windowMs: 20 }).ok).toBe(true);
  });
});
