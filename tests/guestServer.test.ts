import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * resolveGuestAccessByRoomCode/ByStayToken (Prompt G2 Teil 2) are what turn
 * the opaque NFC/QR code and pre-arrival stayToken into "this room, this
 * stay" for the /g/r/[roomCode] and /g/s/[stayToken] routes and their
 * matching API actions. Neither ever leaks *why* access failed (unknown
 * code, wrong room, no current stay, expired/cancelled token) — every
 * failure resolves to null, same neutral outcome.
 */

const roomFindUnique = vi.fn();
const stayFindFirst = vi.fn();
const stayFindUnique = vi.fn();
const getSettingsMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    room: { findUnique: (...args: unknown[]) => roomFindUnique(...args) },
    stay: {
      findFirst: (...args: unknown[]) => stayFindFirst(...args),
      findUnique: (...args: unknown[]) => stayFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/settings", () => ({ getSettings: (...args: unknown[]) => getSettingsMock(...args) }));

import { resolveGuestAccessByRoomCode, resolveGuestAccessByStayToken } from "@/lib/guestServer";

const room412 = { id: "room-412", number: "412", floor: 4, guestAccessCode: "code-412" };

describe("resolveGuestAccessByRoomCode", () => {
  beforeEach(() => {
    roomFindUnique.mockReset();
    stayFindFirst.mockReset();
  });

  it("resolves the room's code straight to its current (IN_HOUSE) stay", async () => {
    roomFindUnique.mockResolvedValue(room412);
    const stay = { id: "stay-1", roomId: "room-412", status: "IN_HOUSE", guestName: "Alex Guest" };
    stayFindFirst.mockResolvedValue(stay);

    const access = await resolveGuestAccessByRoomCode("code-412");

    expect(roomFindUnique).toHaveBeenCalledWith({ where: { guestAccessCode: "code-412" } });
    expect(stayFindFirst).toHaveBeenCalledWith({
      where: { roomId: "room-412", status: "IN_HOUSE" },
      orderBy: { checkIn: "desc" },
    });
    expect(access).toEqual({ room: room412, stay });
  });

  it("resolves to null for an unknown code, without ever looking up a stay", async () => {
    roomFindUnique.mockResolvedValue(null);
    const access = await resolveGuestAccessByRoomCode("does-not-exist");
    expect(access).toBeNull();
    expect(stayFindFirst).not.toHaveBeenCalled();
  });

  it("resolves to null when the room has no active (IN_HOUSE) stay right now", async () => {
    roomFindUnique.mockResolvedValue(room412);
    stayFindFirst.mockResolvedValue(null);
    await expect(resolveGuestAccessByRoomCode("code-412")).resolves.toBeNull();
  });
});

describe("resolveGuestAccessByStayToken", () => {
  const room = { id: "room-1", number: "204", floor: 2 };

  beforeEach(() => {
    stayFindUnique.mockReset();
    getSettingsMock.mockReset();
    getSettingsMock.mockResolvedValue({ guestStayTokenGraceMinutes: 120 });
  });

  it("resolves a valid token (between check-in day and check-out + grace) to its room", async () => {
    const now = new Date("2026-06-10T12:00:00Z");
    vi.useFakeTimers().setSystemTime(now);
    stayFindUnique.mockResolvedValue({
      id: "stay-1",
      status: "EXPECTED",
      checkIn: new Date("2026-06-10T00:00:00Z"),
      checkOut: new Date("2026-06-12T11:00:00Z"),
      room,
    });

    const access = await resolveGuestAccessByStayToken("tok-abc");
    expect(stayFindUnique).toHaveBeenCalledWith({ where: { stayToken: "tok-abc" }, include: { room: true } });
    expect(access?.room).toEqual(room);
    vi.useRealTimers();
  });

  it("resolves to null for an unknown token", async () => {
    stayFindUnique.mockResolvedValue(null);
    await expect(resolveGuestAccessByStayToken("nope")).resolves.toBeNull();
  });

  it("resolves to null once past check-out + the grace period", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-06-12T14:00:00Z")); // 3h after checkout
    stayFindUnique.mockResolvedValue({
      id: "stay-1",
      status: "IN_HOUSE",
      checkIn: new Date("2026-06-10T00:00:00Z"),
      checkOut: new Date("2026-06-12T11:00:00Z"), // + 120min grace = 13:00
      room,
    });
    await expect(resolveGuestAccessByStayToken("tok-abc")).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("resolves to null before the arrival day even starts", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-06-09T23:00:00Z"));
    stayFindUnique.mockResolvedValue({
      id: "stay-1",
      status: "EXPECTED",
      checkIn: new Date("2026-06-10T00:00:00Z"),
      checkOut: new Date("2026-06-12T11:00:00Z"),
      room,
    });
    await expect(resolveGuestAccessByStayToken("tok-abc")).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("resolves to null for a cancelled stay regardless of dates", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-06-10T12:00:00Z"));
    stayFindUnique.mockResolvedValue({
      id: "stay-1",
      status: "CANCELLED",
      checkIn: new Date("2026-06-10T00:00:00Z"),
      checkOut: new Date("2026-06-12T11:00:00Z"),
      room,
    });
    await expect(resolveGuestAccessByStayToken("tok-abc")).resolves.toBeNull();
    vi.useRealTimers();
  });
});
