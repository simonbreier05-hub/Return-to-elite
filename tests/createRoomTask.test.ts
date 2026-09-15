import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * createRoomTask() is the shared create-and-notify path for a supervisor
 * handing the houseman a furniture/bed job (POST /api/roomtasks) — modeled
 * on reportDefect()'s test: verify the record is created with the right
 * shape, routed to the houseman via notification + roomtask:update
 * broadcast, and audited.
 */

const roomTaskCreate = vi.fn();
const notificationCreate = vi.fn();
const auditMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    roomTask: { create: (...args: unknown[]) => roomTaskCreate(...args) },
    notification: { create: (...args: unknown[]) => notificationCreate(...args) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));

import { createRoomTask } from "@/lib/rooms/createRoomTask";

describe("createRoomTask", () => {
  beforeEach(() => {
    roomTaskCreate.mockReset();
    notificationCreate.mockReset();
    auditMock.mockReset();
    broadcastMock.mockReset();
  });

  it("creates the task with the room, type and note, and broadcasts it to the houseman queue", async () => {
    const fakeTask = {
      id: "task-1",
      roomId: "room-1",
      type: "TWIN_SETUP",
      note: null,
      status: "OPEN",
      room: { id: "room-1", number: "207", floor: 2 },
      createdBy: { id: "user-1", name: "Sofia Marchetti" },
      assignedTo: null,
    };
    roomTaskCreate.mockResolvedValue(fakeTask);
    notificationCreate.mockResolvedValue({ id: "notif-1" });

    const result = await createRoomTask({
      room: { id: "room-1", number: "207" },
      type: "TWIN_SETUP",
      note: null,
      createdById: "user-1",
    });

    expect(roomTaskCreate).toHaveBeenCalledWith({
      data: { roomId: "room-1", type: "TWIN_SETUP", note: null, createdById: "user-1" },
      include: expect.any(Object),
    });

    const notificationArgs = notificationCreate.mock.calls[0][0].data;
    expect(notificationArgs.targetRole).toBe("houseman");
    expect(notificationArgs.message).toContain("207");

    const roomtaskUpdateCall = broadcastMock.mock.calls.find(([event]) => event === "roomtask:update");
    expect(roomtaskUpdateCall).toBeTruthy();
    expect((roomtaskUpdateCall as [string, { roomTask: typeof fakeTask }])[1].roomTask).toEqual(fakeTask);

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ROOM_TASK_CREATED", roomId: "room-1", userId: "user-1" })
    );
    expect(result).toEqual(fakeTask);
  });

  it("passes a trimmed free-text note through for SONSTIGES", async () => {
    roomTaskCreate.mockResolvedValue({ id: "task-2", room: { number: "108" } });
    notificationCreate.mockResolvedValue({ id: "notif-2" });

    await createRoomTask({
      room: { id: "room-2", number: "108" },
      type: "SONSTIGES",
      note: "Extra bed to be removed.",
      createdById: "user-1",
    });

    expect(roomTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "SONSTIGES", note: "Extra bed to be removed." }),
      })
    );
    const notificationArgs = notificationCreate.mock.calls[0][0].data;
    expect(notificationArgs.message).toContain("Extra bed to be removed.");
  });
});
