import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";
import { resetDb, seedRoom } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

function guestActor(roomNumber: string) {
  return { userId: null, name: `Gast, Zimmer ${roomNumber}`, role: "guest" as const };
}

describe("guest DND — routed through applyStatusChange, not around it", () => {
  it("DIRTY → BLOCKED sets blockReason DND and the chosen blockedUntil", async () => {
    const room = await seedRoom({ number: "305", status: "DIRTY" });
    const until = new Date(Date.now() + 2 * 60 * 60_000);

    const result = await applyStatusChange(guestActor(room.number), room.id, {
      status: "BLOCKED",
      blockReason: "DND",
      blockedUntil: until,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.status).toBe("BLOCKED");
      expect(result.room.blockReason).toBe("DND");
      expect(result.room.blockedUntil?.getTime()).toBe(until.getTime());
    }
  });

  it("BLOCKED → BLOCKED succeeds (idempotent re-confirm) and updates blockedUntil", async () => {
    const firstUntil = new Date(Date.now() + 60 * 60_000);
    const room = await seedRoom({
      number: "306",
      status: "BLOCKED",
      blockReason: "DND",
      blockedSince: new Date(),
      blockedUntil: firstUntil,
    });

    const extendedUntil = new Date(Date.now() + 4 * 60 * 60_000);
    const result = await applyStatusChange(guestActor(room.number), room.id, {
      status: "BLOCKED",
      blockReason: "DND",
      blockedUntil: extendedUntil,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.room.blockedUntil?.getTime()).toBe(extendedUntil.getTime());
  });

  it("a guest actor can never reach INSPECTED (or anything but BLOCKED)", async () => {
    const room = await seedRoom({ number: "307", status: "CLEAN" });
    const result = await applyStatusChange(guestActor(room.number), room.id, { status: "INSPECTED" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("writes an audit entry with userId null and a guest-identifying meta", async () => {
    const room = await seedRoom({ number: "308", status: "DIRTY" });
    await applyStatusChange(guestActor(room.number), room.id, { status: "BLOCKED", blockReason: "DND" });

    const entries = await prisma.auditLog.findMany({ where: { roomId: room.id, action: "STATUS_CHANGE" } });
    expect(entries).toHaveLength(1);
    expect(entries[0].userId).toBeNull();
    const meta = JSON.parse(entries[0].meta!);
    expect(meta.role).toBe("guest");
    expect(meta.actorName).toContain("Gast, Zimmer 308");
  });

  it("also audits a denied guest attempt (never silent)", async () => {
    const room = await seedRoom({ number: "309", status: "CLEAN" });
    await applyStatusChange(guestActor(room.number), room.id, { status: "INSPECTED" });

    const denied = await prisma.auditLog.findMany({ where: { roomId: room.id, action: "STATUS_CHANGE_DENIED" } });
    expect(denied).toHaveLength(1);
    expect(denied[0].userId).toBeNull();
  });
});
