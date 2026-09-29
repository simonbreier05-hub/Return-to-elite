import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * "Gast kann eine DND-Einstellung selbst zurücknehmen" (Prompt G2 Teil 3):
 * dnd-cancel finds the room's currently-open DND GuestRequest and marks it
 * CANCELLED, without ever touching Room.status/blockReason (staff-only).
 */

const guestRequestFindFirst = vi.fn();
const guestRequestUpdate = vi.fn();
const notificationCreate = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    guestRequest: {
      findFirst: (...args: unknown[]) => guestRequestFindFirst(...args),
      update: (...args: unknown[]) => guestRequestUpdate(...args),
    },
    notification: { create: (...args: unknown[]) => notificationCreate(...args) },
  },
}));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/guestServer", () => ({ getGuestSystemUserId: async () => "guest-system-user-id" }));

import { runGuestAction } from "@/lib/guestActions";

const room = { id: "room-1", number: "412" };
const req = new NextRequest("http://localhost/api/guest/r/code/dnd-cancel", { method: "POST" });

describe("dnd-cancel", () => {
  it("cancels the currently open DND request and notifies staff", async () => {
    guestRequestFindFirst.mockReset().mockResolvedValue({ id: "req-1", roomId: "room-1", kind: "DND", status: "RECEIVED" });
    guestRequestUpdate.mockReset().mockResolvedValue({});
    notificationCreate.mockReset().mockResolvedValue({ id: "notif-1" });
    broadcastMock.mockReset();

    const res = await runGuestAction("dnd-cancel", room, req);
    expect(res.status).toBe(200);

    expect(guestRequestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: "room-1", kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } } })
    );
    expect(guestRequestUpdate).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { status: "CANCELLED" } });
    expect(broadcastMock).toHaveBeenCalledWith("notification:new", expect.anything());
  });

  it("errors when there is nothing active to cancel", async () => {
    guestRequestFindFirst.mockReset().mockResolvedValue(null);
    guestRequestUpdate.mockReset();

    const res = await runGuestAction("dnd-cancel", room, req);
    expect(res.status).toBe(400);
    expect(guestRequestUpdate).not.toHaveBeenCalled();
  });
});
