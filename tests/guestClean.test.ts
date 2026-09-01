import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { requestGuestCleaning } from "@/lib/rooms/requestGuestCleaning";
import { computePriority } from "@/lib/priority/computePriority";
import { resetDb, seedRoom } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

describe("requestGuestCleaning — not a status change", () => {
  it("'now' sets guestCleanRequestedFor to roughly the current time and writes an audit row", async () => {
    const room = await seedRoom({ number: "410", status: "DIRTY" });
    const before = Date.now();

    await requestGuestCleaning(room.id, room.number, "Gast, Zimmer 410", { target: "now" });

    const updated = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(updated.status).toBe("DIRTY"); // unchanged — this is a timing hint, not a status change
    expect(updated.guestCleanRequestedFor).not.toBeNull();
    expect(Math.abs(updated.guestCleanRequestedFor!.getTime() - before)).toBeLessThan(5000);

    const entries = await prisma.auditLog.findMany({ where: { roomId: room.id, action: "GUEST_CLEAN_REQUESTED" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBeNull();
  });

  it("'soon' sets the target to about 30 minutes out", async () => {
    const room = await seedRoom({ number: "411" });
    await requestGuestCleaning(room.id, room.number, "Gast, Zimmer 411", { target: "soon" });
    const updated = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    const deltaMin = (updated.guestCleanRequestedFor!.getTime() - Date.now()) / 60_000;
    expect(deltaMin).toBeGreaterThan(25);
    expect(deltaMin).toBeLessThan(35);
  });

  it("'later' uses the guest's chosen time", async () => {
    const room = await seedRoom({ number: "412" });
    const laterAt = new Date(Date.now() + 3 * 60 * 60_000);
    await requestGuestCleaning(room.id, room.number, "Gast, Zimmer 412", { target: "later", laterAt });
    const updated = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(updated.guestCleanRequestedFor?.getTime()).toBe(laterAt.getTime());
  });

  it("feeds real priority scoring — a room with a due guest request outscores an identical room without one", async () => {
    const requested = await seedRoom({ number: "413", status: "DIRTY" });
    const plain = await seedRoom({ number: "414", status: "DIRTY" });
    await requestGuestCleaning(requested.id, requested.number, "Gast, Zimmer 413", { target: "now" });

    const now = new Date();
    const ctx = { now, arrivals: [], excursions: [] };
    const refreshedRequested = await prisma.room.findUniqueOrThrow({ where: { id: requested.id } });

    const toInput = (r: typeof refreshedRequested) => ({
      id: r.id,
      number: r.number,
      floor: r.floor,
      section: r.section,
      status: r.status,
      isCheckoutToday: r.isCheckoutToday,
      guestCleanRequestedFor: r.guestCleanRequestedFor,
    });

    const scoreRequested = computePriority(toInput(refreshedRequested), ctx).score;
    const scorePlain = computePriority(toInput(plain), ctx).score;

    expect(scoreRequested).toBeGreaterThan(scorePlain);
  });
});
