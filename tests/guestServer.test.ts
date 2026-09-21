import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * getGuestRoom() is what turns the dynamic /guest/[roomNumber] route (and
 * every /api/guest/[roomNumber]/* action route) into a per-room lookup
 * instead of the old single hard-coded room305 demo. Verify it looks up
 * whatever room number it's given — several different rooms, not just one —
 * and resolves to null (not a throw) for a room number that doesn't exist,
 * which is what lets the page/route show a clean "not found" message
 * instead of crashing.
 */

const roomFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { room: { findUnique: (...args: unknown[]) => roomFindUnique(...args) } },
}));

import { getGuestRoom } from "@/lib/guestServer";

describe("getGuestRoom", () => {
  beforeEach(() => roomFindUnique.mockReset());

  it("looks up the room by whatever number it's given", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-412", number: "412", floor: 4 });
    const room = await getGuestRoom("412");
    expect(roomFindUnique).toHaveBeenCalledWith({ where: { number: "412" } });
    expect(room).toEqual({ id: "room-412", number: "412", floor: 4 });
  });

  it("works for a different room number without any special-casing", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-208", number: "208", floor: 2 });
    const room = await getGuestRoom("208");
    expect(roomFindUnique).toHaveBeenCalledWith({ where: { number: "208" } });
    expect(room).toEqual({ id: "room-208", number: "208", floor: 2 });
  });

  it("resolves to null for a room number that doesn't exist, rather than throwing", async () => {
    roomFindUnique.mockResolvedValue(null);
    await expect(getGuestRoom("999")).resolves.toBeNull();
  });
});
