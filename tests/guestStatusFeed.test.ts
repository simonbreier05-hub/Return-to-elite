import { describe, expect, it, vi } from "vitest";

/**
 * getGuestStatusFeed (Prompt G2 Teil 3): merges GuestRequest rows with the
 * guest's own RoomNote/Defect submissions into one status list, mapped to
 * the simple RECEIVED/IN_PROGRESS/DONE/CANCELLED vocabulary the guest
 * screen shows. Critically, it must never include staff-authored notes —
 * only rows the guest system account itself created.
 */

const guestRequestFindMany = vi.fn();
const roomNoteFindMany = vi.fn();
const defectFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    guestRequest: { findMany: (...args: unknown[]) => guestRequestFindMany(...args) },
    roomNote: { findMany: (...args: unknown[]) => roomNoteFindMany(...args) },
    defect: { findMany: (...args: unknown[]) => defectFindMany(...args) },
  },
}));
vi.mock("@/lib/guestServer", () => ({ getGuestSystemUserId: async () => "guest-system-user-id" }));

import { getGuestStatusFeed } from "@/lib/guestStatusFeed";

describe("getGuestStatusFeed", () => {
  it("only queries notes/defects authored by the guest system account", async () => {
    guestRequestFindMany.mockReset().mockResolvedValue([]);
    roomNoteFindMany.mockReset().mockResolvedValue([]);
    defectFindMany.mockReset().mockResolvedValue([]);

    await getGuestStatusFeed("room-1");

    expect(roomNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roomId: "room-1", authorId: "guest-system-user-id" }) })
    );
    expect(defectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roomId: "room-1", reportedById: "guest-system-user-id" }) })
    );
  });

  it("maps WorkOrder status to the guest's simplified status", async () => {
    guestRequestFindMany.mockReset().mockResolvedValue([]);
    roomNoteFindMany.mockReset().mockResolvedValue([]);
    defectFindMany.mockReset().mockResolvedValue([
      {
        id: "defect-1",
        category: "PLUMBING",
        createdAt: new Date("2026-06-10T10:00:00Z"),
        workOrder: { status: "RESOLVED" },
      },
    ]);

    const { items } = await getGuestStatusFeed("room-1");
    expect(items).toEqual([
      { id: "defect-1", kind: "DEFECT", detail: "PLUMBING", status: "DONE", createdAt: "2026-06-10T10:00:00.000Z" },
    ]);
  });

  it("maps RoomNote OPEN/DONE to RECEIVED/DONE", async () => {
    guestRequestFindMany.mockReset().mockResolvedValue([]);
    roomNoteFindMany.mockReset().mockResolvedValue([
      { id: "note-1", body: "Extra towels please", status: "OPEN", createdAt: new Date("2026-06-10T09:00:00Z") },
    ]);
    defectFindMany.mockReset().mockResolvedValue([]);

    const { items } = await getGuestStatusFeed("room-1");
    expect(items[0]).toMatchObject({ id: "note-1", kind: "NOTE", status: "RECEIVED" });
  });

  it("reports the most recent still-open DND request as activeDnd", async () => {
    guestRequestFindMany.mockReset().mockResolvedValue([
      {
        id: "req-2",
        kind: "DND",
        detail: '{"window":"MORNING"}',
        status: "RECEIVED",
        createdAt: new Date("2026-06-10T12:00:00Z"),
      },
      {
        id: "req-1",
        kind: "DND",
        detail: '{"window":"NOW"}',
        status: "CANCELLED",
        createdAt: new Date("2026-06-10T09:00:00Z"),
      },
    ]);
    roomNoteFindMany.mockReset().mockResolvedValue([]);
    defectFindMany.mockReset().mockResolvedValue([]);

    const { activeDnd } = await getGuestStatusFeed("room-1");
    expect(activeDnd).toEqual({ id: "req-2", detail: '{"window":"MORNING"}' });
  });

  it("reports no activeDnd when every DND request is resolved/cancelled", async () => {
    guestRequestFindMany.mockReset().mockResolvedValue([
      { id: "req-1", kind: "DND", detail: null, status: "CANCELLED", createdAt: new Date() },
    ]);
    roomNoteFindMany.mockReset().mockResolvedValue([]);
    defectFindMany.mockReset().mockResolvedValue([]);

    const { activeDnd } = await getGuestStatusFeed("room-1");
    expect(activeDnd).toBeNull();
  });

  it("sorts the merged feed newest first", async () => {
    guestRequestFindMany.mockReset().mockResolvedValue([
      { id: "req-1", kind: "CONTACT", detail: null, status: "RECEIVED", createdAt: new Date("2026-06-10T08:00:00Z") },
    ]);
    roomNoteFindMany.mockReset().mockResolvedValue([
      { id: "note-1", body: "hi", status: "OPEN", createdAt: new Date("2026-06-10T11:00:00Z") },
    ]);
    defectFindMany.mockReset().mockResolvedValue([
      { id: "defect-1", category: "OTHER", createdAt: new Date("2026-06-10T09:30:00Z"), workOrder: { status: "OPEN" } },
    ]);

    const { items } = await getGuestStatusFeed("room-1");
    expect(items.map((i) => i.id)).toEqual(["note-1", "defect-1", "req-1"]);
  });
});
