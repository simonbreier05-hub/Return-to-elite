import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression test for the technician-screen crash: a `workorder:update`
 * broadcast that omitted `defect.reportedBy` (and slimmed `defect.room` down
 * to just `{ number }`) crashed EngineeringView, which renders
 * `wo.defect.reportedBy.name` and `wo.defect.room.{status,floor,openNotesCount}`
 * unconditionally on every update — see src/lib/rooms/reportDefect.ts.
 */

const broadcastMock = vi.fn();
const auditMock = vi.fn();
const defectCreateMock = vi.fn();
const notificationCreateMock = vi.fn();

vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    defect: { create: (...args: unknown[]) => defectCreateMock(...args) },
    notification: { create: (...args: unknown[]) => notificationCreateMock(...args) },
  },
}));

const { reportDefect } = await import("@/lib/rooms/reportDefect");

describe("reportDefect — workorder:update broadcast payload", () => {
  beforeEach(() => {
    broadcastMock.mockClear();
    auditMock.mockClear();
    defectCreateMock.mockReset();
    notificationCreateMock.mockReset();
  });

  it("includes reportedBy and the room's status/floor/openNotesCount, not just its number", async () => {
    defectCreateMock.mockResolvedValue({
      id: "defect-1",
      category: "PLUMBING",
      note: "Leaky tap",
      photoPath: null,
      workOrder: { id: "wo-1", status: "OPEN" },
      reportedBy: { name: "Maria Silva", role: "room_attendant" },
      room: { number: "517", status: "OUT_OF_ORDER", floor: 5, _count: { notes: 2 } },
    });
    notificationCreateMock.mockResolvedValue({ id: "notif-1" });

    await reportDefect({
      room: { id: "room-1", number: "517" },
      category: "PLUMBING",
      note: "Leaky tap",
      photoPath: null,
      reportedById: "user-1",
    });

    const call = broadcastMock.mock.calls.find(([event]) => event === "workorder:update");
    expect(call).toBeTruthy();
    const payload = call![1] as { workOrder: { defect: Record<string, unknown> } };

    expect(payload.workOrder.defect.reportedBy).toEqual({ name: "Maria Silva", role: "room_attendant" });
    expect(payload.workOrder.defect.room).toMatchObject({ number: "517", status: "OUT_OF_ORDER", floor: 5, openNotesCount: 2 });
    // The raw Prisma _count shape must not leak into the broadcast payload —
    // EngineeringView (and RoomDetailModal) read openNotesCount directly.
    expect(payload.workOrder.defect.room).not.toHaveProperty("_count");
  });
});
