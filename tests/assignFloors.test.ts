import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * assignFloors() is the duty-manager floor-assignment write path (PATCH
 * /api/users/[id]/floors) — modeled on createRoomTask.test.ts: verify the
 * record is updated with the right (serialized) shape, audited, and
 * broadcast to any other connected duty-manager screens.
 */

const userUpdate = vi.fn();
const auditMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { user: { update: (...args: unknown[]) => userUpdate(...args) } },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));

import { assignFloors } from "@/lib/users/assignFloors";

describe("assignFloors", () => {
  beforeEach(() => {
    userUpdate.mockReset();
    auditMock.mockReset();
    broadcastMock.mockReset();
  });

  it("stores the floors as a sorted, deduplicated comma-separated string", async () => {
    userUpdate.mockResolvedValue({
      id: "sup-1",
      name: "Sofia Marchetti",
      email: "supervisor@hotel.test",
      role: "supervisor",
      assignedFloors: "1,3",
    });

    await assignFloors({ user: { id: "sup-1", name: "Sofia Marchetti" }, floors: [3, 1, 3], actorId: "manager-1" });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "sup-1" },
      data: { assignedFloors: "1,3" },
      select: { id: true, name: true, email: true, role: true, assignedFloors: true },
    });
  });

  it("audits the change against the actor and the supervisor, and broadcasts it", async () => {
    userUpdate.mockResolvedValue({
      id: "sup-1",
      name: "Sofia Marchetti",
      email: "supervisor@hotel.test",
      role: "supervisor",
      assignedFloors: "2",
    });

    await assignFloors({ user: { id: "sup-1", name: "Sofia Marchetti" }, floors: [2], actorId: "manager-1" });

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SUPERVISOR_FLOORS_ASSIGNED",
        userId: "manager-1",
        meta: { supervisorId: "sup-1", floors: [2] },
      })
    );
    expect(broadcastMock).toHaveBeenCalledWith("user:floors", { userId: "sup-1", floors: [2] });
  });

  it("returns the updated user row", async () => {
    const updated = { id: "sup-1", name: "Sofia Marchetti", email: "supervisor@hotel.test", role: "supervisor", assignedFloors: "1,2,5" };
    userUpdate.mockResolvedValue(updated);

    const result = await assignFloors({ user: { id: "sup-1", name: "Sofia Marchetti" }, floors: [1, 2, 5], actorId: "manager-1" });

    expect(result).toEqual(updated);
  });
});
