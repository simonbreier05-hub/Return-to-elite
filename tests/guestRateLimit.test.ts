import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Guest write actions share one rate-limit counter per room+IP across all
 * five actions (Prompt G2 Teil 2: "je Zimmer/IP max. X Wünsche pro
 * Stunde") — not five separate per-endpoint counters.
 */

const getSettingsMock = vi.fn();
vi.mock("@/lib/settings", () => ({ getSettings: (...args: unknown[]) => getSettingsMock(...args) }));

import { checkGuestRateLimit, getClientIp, __resetGuestRateLimitForTests } from "@/lib/guestRateLimit";

describe("checkGuestRateLimit", () => {
  beforeEach(() => {
    __resetGuestRateLimitForTests();
    getSettingsMock.mockReset();
    getSettingsMock.mockResolvedValue({ guestRateLimitPerHour: 3 });
  });

  it("allows requests under the limit and blocks the one that exceeds it", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    for (let i = 0; i < 3; i++) {
      await expect(checkGuestRateLimit("room-1", "1.2.3.4", now)).resolves.toEqual({ ok: true });
    }
    const blocked = await checkGuestRateLimit("room-1", "1.2.3.4", now);
    expect(blocked.ok).toBe(false);
  });

  it("keeps counters separate per room", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    for (let i = 0; i < 3; i++) await checkGuestRateLimit("room-1", "1.2.3.4", now);
    await expect(checkGuestRateLimit("room-2", "1.2.3.4", now)).resolves.toEqual({ ok: true });
  });

  it("keeps counters separate per IP for the same room", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    for (let i = 0; i < 3; i++) await checkGuestRateLimit("room-1", "1.2.3.4", now);
    await expect(checkGuestRateLimit("room-1", "5.6.7.8", now)).resolves.toEqual({ ok: true });
  });

  it("allows requests again once the rolling hour window has passed", async () => {
    const start = new Date("2026-06-10T12:00:00Z");
    for (let i = 0; i < 3; i++) await checkGuestRateLimit("room-1", "1.2.3.4", start);
    const anHourLater = new Date(start.getTime() + 60 * 60 * 1000 + 1000);
    await expect(checkGuestRateLimit("room-1", "1.2.3.4", anHourLater)).resolves.toEqual({ ok: true });
  });
});

describe("getClientIp", () => {
  it("reads the first address out of X-Forwarded-For", () => {
    const req = { headers: new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }) } as unknown as Parameters<
      typeof getClientIp
    >[0];
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to X-Real-IP, then 'unknown'", () => {
    const withRealIp = { headers: new Headers({ "x-real-ip": "198.51.100.7" }) } as unknown as Parameters<
      typeof getClientIp
    >[0];
    expect(getClientIp(withRealIp)).toBe("198.51.100.7");

    const withNeither = { headers: new Headers() } as unknown as Parameters<typeof getClientIp>[0];
    expect(getClientIp(withNeither)).toBe("unknown");
  });
});
