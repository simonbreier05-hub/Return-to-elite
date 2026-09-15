import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Moving a room between two housekeepers must not scramble either person's
 * Laufplan: the moved room lands at the end of the target's route, and the
 * source's remaining rooms are re-sequenced to close the gap it left.
 */

const roomFindUnique = vi.fn();
const roomFindMany = vi.fn();
const roomUpdate = vi.fn();
const userFindUnique = vi.fn();
const transactionMock = vi.fn();
const auditMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    room: {
      findUnique: (...a: unknown[]) => roomFindUnique(...a),
      findMany: (...a: unknown[]) => roomFindMany(...a),
      update: (...a: unknown[]) => roomUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));

import { moveRoomBetweenAttendants } from "@/lib/rooms/moveRoomBetweenAttendants";

const session = { userId: "sup-1", name: "Supervisor", role: "supervisor" as const };

beforeEach(() => {
  roomFindUnique.mockReset();
  roomFindMany.mockReset();
  roomUpdate.mockReset();
  userFindUnique.mockReset();
  transactionMock.mockReset();
  auditMock.mockReset();
  broadcastMock.mockReset();

  // Every prisma.room.update call resolves to a fake room reflecting its data —
  // real Prisma returns a promise-like query, so $transaction can Promise.all them.
  roomUpdate.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve({ id: where.id, number: `R-${where.id}`, ...data, assignedTo: null })
  );
  transactionMock.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
});

describe("moveRoomBetweenAttendants", () => {
  it("appends the moved room after the target's current highest routeOrder", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-1", assignedToId: "att-a" });
    userFindUnique.mockResolvedValue({ id: "att-b", role: "room_attendant" });
    roomFindMany.mockImplementation(({ where }: { where: { assignedToId: string } }) => {
      if (where.assignedToId === "att-b") {
        return Promise.resolve([{ id: "room-9", routeOrder: 0 }, { id: "room-10", routeOrder: 1 }]);
      }
      return Promise.resolve([{ id: "room-2", routeOrder: 0 }, { id: "room-3", routeOrder: 2 }]);
    });

    const result = await moveRoomBetweenAttendants(session, "room-1", "att-b");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.room.routeOrder).toBe(2); // after room-9 (0) and room-10 (1)
    expect(result.room.assignedToId).toBe("att-b");
  });

  it("re-sequences the source attendant's remaining rooms to close the gap", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-1", assignedToId: "att-a" });
    userFindUnique.mockResolvedValue({ id: "att-b", role: "room_attendant" });
    roomFindMany.mockImplementation(({ where }: { where: { assignedToId: string } }) => {
      if (where.assignedToId === "att-b") return Promise.resolve([]);
      return Promise.resolve([{ id: "room-2", routeOrder: 0 }, { id: "room-3", routeOrder: 2 }]);
    });

    await moveRoomBetweenAttendants(session, "room-1", "att-b");

    const siblingUpdates = roomUpdate.mock.calls
      .map(([args]) => args)
      .filter((args) => args.where.id !== "room-1");
    expect(siblingUpdates).toEqual([
      { where: { id: "room-2" }, data: { routeOrder: 0 } },
      { where: { id: "room-3" }, data: { routeOrder: 1 } },
    ]);
  });

  it("broadcasts route:reordered for both attendants and room:update for the moved room", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-1", assignedToId: "att-a" });
    userFindUnique.mockResolvedValue({ id: "att-b", role: "room_attendant" });
    roomFindMany.mockImplementation(({ where }: { where: { assignedToId: string } }) =>
      Promise.resolve(where.assignedToId === "att-b" ? [] : [])
    );

    await moveRoomBetweenAttendants(session, "room-1", "att-b");

    const events = broadcastMock.mock.calls.map(([event]) => event);
    expect(events).toContain("room:update");
    expect(events.filter((e) => e === "route:reordered")).toHaveLength(2);
  });

  it("rejects moving a room to the attendant it is already assigned to", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-1", assignedToId: "att-a" });

    const result = await moveRoomBetweenAttendants(session, "room-1", "att-a");

    expect(result).toEqual({ ok: false, status: 409, error: expect.any(String) });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects moving a room that has no attendant yet", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-1", assignedToId: null });

    const result = await moveRoomBetweenAttendants(session, "room-1", "att-b");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.status).toBe(409);
  });

  it("rejects a target that is not a room attendant", async () => {
    roomFindUnique.mockResolvedValue({ id: "room-1", assignedToId: "att-a" });
    userFindUnique.mockResolvedValue({ id: "sup-2", role: "supervisor" });

    const result = await moveRoomBetweenAttendants(session, "room-1", "sup-2");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.status).toBe(400);
  });

  it("404s for an unknown room", async () => {
    roomFindUnique.mockResolvedValue(null);

    const result = await moveRoomBetweenAttendants(session, "missing", "att-b");

    expect(result).toEqual({ ok: false, status: 404, error: expect.any(String) });
  });
});
