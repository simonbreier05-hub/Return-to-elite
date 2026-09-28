import { describe, expect, it, vi } from "vitest";

/**
 * ensureRoomAccessCode/regenerateRoomAccessCode back the QR/NFC generator
 * page (Prompt G2 Teil 2): a room keeps its code across calls until
 * explicitly regenerated (e.g. a lost tag), and a unique-constraint clash
 * (astronomically unlikely at 128 bit, but not impossible) is retried
 * rather than surfaced to the caller.
 *
 * Mocks are reset at the top of each test body rather than in a shared
 * beforeEach: a beforeEach hook between a test whose mock throws and the
 * next test gives Vitest's unhandled-rejection tracking just enough of a
 * gap to misattribute a phantom failure to the throwing test, even though
 * it already caught and asserted on that exact error. Resetting inline
 * avoids the gap; it does not change what's being tested.
 */

const findUniqueOrThrow = vi.fn();
const update = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    room: {
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrow(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { ensureRoomAccessCode, regenerateRoomAccessCode } from "@/lib/guestRoomCode";

describe("ensureRoomAccessCode", () => {
  it("returns the existing code without writing, if one is already set", async () => {
    findUniqueOrThrow.mockReset();
    update.mockReset();
    findUniqueOrThrow.mockResolvedValue({ guestAccessCode: "existing-code" });

    const code = await ensureRoomAccessCode("room-1");
    expect(code).toBe("existing-code");
    expect(update).not.toHaveBeenCalled();
  });

  it("generates and persists a new code when none exists yet", async () => {
    findUniqueOrThrow.mockReset();
    update.mockReset();
    findUniqueOrThrow.mockResolvedValue({ guestAccessCode: null });
    update.mockResolvedValue({});

    const code = await ensureRoomAccessCode("room-1");
    expect(code).toEqual(expect.any(String));
    expect(code.length).toBeGreaterThan(10);
    expect(update).toHaveBeenCalledWith({ where: { id: "room-1" }, data: { guestAccessCode: code } });
  });
});

describe("regenerateRoomAccessCode", () => {
  it("always overwrites, even if a code already existed", async () => {
    update.mockReset();
    update.mockResolvedValue({});

    const code = await regenerateRoomAccessCode("room-1");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "room-1" }, data: { guestAccessCode: code } });
  });

  it("retries on a unique-constraint clash instead of failing the request", async () => {
    update.mockReset();
    const clash = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    let calls = 0;
    update.mockImplementation(() => {
      calls += 1;
      if (calls === 1) throw clash;
      return Promise.resolve({});
    });

    const code = await regenerateRoomAccessCode("room-1");
    expect(update).toHaveBeenCalledTimes(2);
    expect(code).toEqual(expect.any(String));
  });

  it("gives up after repeated clashes rather than retrying forever", async () => {
    update.mockReset();
    const clash = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    update.mockImplementation(() => {
      throw clash;
    });

    let caught: unknown;
    try {
      await regenerateRoomAccessCode("room-1");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(clash);
  });

  it("does not retry a non-collision error", async () => {
    update.mockReset();
    const dbDown = new Error("connection refused");
    update.mockImplementation(() => {
      throw dbDown;
    });

    let caught: unknown;
    try {
      await regenerateRoomAccessCode("room-1");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(dbDown);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
