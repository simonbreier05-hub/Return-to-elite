import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The three "ephemeral Notification only" guest actions (dnd, clean-request,
 * contact) now also persist a GuestRequest row (Prompt G2 Teil 3) so the
 * guest screen has something to poll a status for. Both writes must happen
 * — losing the GuestRequest silently would mean the guest never sees their
 * own request in "Ihre Anfragen", even though staff got the Notification.
 */

const notificationCreate = vi.fn();
const guestRequestCreate = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { create: (...args: unknown[]) => notificationCreate(...args) },
    guestRequest: { create: (...args: unknown[]) => guestRequestCreate(...args) },
  },
}));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));

import { runGuestAction } from "@/lib/guestActions";

const room = { id: "room-1", number: "412" };

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/guest/r/code/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("dnd", () => {
  it("creates both a Notification and a GuestRequest", async () => {
    notificationCreate.mockReset().mockResolvedValue({ id: "notif-1" });
    guestRequestCreate.mockReset().mockResolvedValue({ id: "req-1" });
    broadcastMock.mockReset();

    const res = await runGuestAction("dnd", room, jsonRequest({ window: "NOW" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, requestId: "req-1" });

    expect(guestRequestCreate).toHaveBeenCalledWith({
      data: { roomId: "room-1", kind: "DND", detail: JSON.stringify({ window: "NOW" }) },
    });
  });
});

describe("clean-request", () => {
  it("creates a GuestRequest with the timing detail", async () => {
    notificationCreate.mockReset().mockResolvedValue({ id: "notif-1" });
    guestRequestCreate.mockReset().mockResolvedValue({ id: "req-2" });
    broadcastMock.mockReset();

    const res = await runGuestAction("clean-request", room, jsonRequest({ timing: "LATER", time: "15:00" }));
    expect(res.status).toBe(201);
    expect(guestRequestCreate).toHaveBeenCalledWith({
      data: { roomId: "room-1", kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing: "LATER", time: "15:00" }) },
    });
  });
});

describe("contact", () => {
  it("creates a GuestRequest with the department detail", async () => {
    notificationCreate.mockReset().mockResolvedValue({ id: "notif-1" });
    guestRequestCreate.mockReset().mockResolvedValue({ id: "req-3" });
    broadcastMock.mockReset();

    const res = await runGuestAction("contact", room, jsonRequest({ department: "housekeeping" }));
    expect(res.status).toBe(201);
    expect(guestRequestCreate).toHaveBeenCalledWith({
      data: { roomId: "room-1", kind: "CONTACT", detail: JSON.stringify({ department: "housekeeping" }) },
    });
  });
});
