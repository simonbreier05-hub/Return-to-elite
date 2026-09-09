import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression test for the technician-screen crash: the workorder:update
 * broadcast fired by reportDefect() must carry a complete defect — in
 * particular `reportedBy` and the room's `status`/`floor` — because
 * EngineeringView renders `wo.defect.reportedBy.name` and expects the full
 * WorkOrder shape on every live update, not just the initial GET /api/workorders
 * load. A broadcast missing any of these previously threw a TypeError that,
 * with no ErrorBoundary in the tree, took down the whole engineering screen.
 */

const defectCreate = vi.fn();
const notificationCreate = vi.fn();
const auditMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    defect: { create: (...args: unknown[]) => defectCreate(...args) },
    notification: { create: (...args: unknown[]) => notificationCreate(...args) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));

import { reportDefect } from "@/lib/rooms/reportDefect";

describe("reportDefect — workorder:update broadcast payload", () => {
  beforeEach(() => {
    defectCreate.mockReset();
    notificationCreate.mockReset();
    auditMock.mockReset();
    broadcastMock.mockReset();
  });

  it("includes reportedBy and the room's status/floor in the broadcast defect", async () => {
    const fakeDefect = {
      id: "defect-1",
      roomId: "room-1",
      category: "PLUMBING",
      note: "Leaking tap",
      photoPath: null,
      reportedById: "user-1",
      workOrder: { id: "wo-1", status: "OPEN" },
      room: { number: "304", status: "DEFECT_REPORTED", floor: 3 },
      reportedBy: { name: "Maria Silva", role: "room_attendant" },
    };
    defectCreate.mockResolvedValue(fakeDefect);
    notificationCreate.mockResolvedValue({ id: "notif-1" });

    await reportDefect({
      room: { id: "room-1", number: "304" },
      category: "PLUMBING",
      note: "Leaking tap",
      photoPath: null,
      reportedById: "user-1",
    });

    // The include on defect.create must ask Prisma for reportedBy and the
    // room's status/floor — this is what would have silently dropped them.
    const createArgs = defectCreate.mock.calls[0][0];
    expect(createArgs.include.reportedBy).toEqual({ select: { name: true, role: true } });
    expect(createArgs.include.room).toEqual({ select: { number: true, status: true, floor: true } });

    const workorderUpdateCall = broadcastMock.mock.calls.find(([event]) => event === "workorder:update");
    expect(workorderUpdateCall).toBeTruthy();
    const [, payload] = workorderUpdateCall as [string, { workOrder: { defect: typeof fakeDefect } }];
    expect(payload.workOrder.defect.reportedBy).toEqual({ name: "Maria Silva", role: "room_attendant" });
    expect(payload.workOrder.defect.room).toEqual({ number: "304", status: "DEFECT_REPORTED", floor: 3 });
  });
});
