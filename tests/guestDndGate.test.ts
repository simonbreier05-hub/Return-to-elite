import { describe, expect, it, vi } from "vitest";

/**
 * "Housekeeper darf DND-Zimmer nicht starten (Hinweis, Supervisor kann
 * übersteuern)" (Prompt G2 Teil 4). Guest DND never touches Room.status/
 * blockReason (src/lib/guestActions.ts), so this gate is a separate check
 * inside applyStatusChange — only for room_attendant, only for the
 * DIRTY/PICKUP → IN_PROGRESS transition.
 */

const roomFindUnique = vi.fn();
const roomUpdate = vi.fn();
const guestRequestFindFirst = vi.fn();
const userUpdate = vi.fn();
const auditMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    room: { findUnique: (...args: unknown[]) => roomFindUnique(...args), update: (...args: unknown[]) => roomUpdate(...args) },
    guestRequest: { findFirst: (...args: unknown[]) => guestRequestFindFirst(...args) },
    user: { update: (...args: unknown[]) => userUpdate(...args) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));
vi.mock("@/lib/pms/MockPMSConnector", () => ({ pms: { pushRoomStatus: vi.fn() } }));

import { applyStatusChange } from "@/lib/rooms/applyStatusChange";

const room = { id: "room-1", number: "412", status: "DIRTY", blockReason: null };

function reset() {
  roomFindUnique.mockReset().mockResolvedValue(room);
  roomUpdate.mockReset().mockResolvedValue({ ...room, status: "IN_PROGRESS" });
  guestRequestFindFirst.mockReset();
  userUpdate.mockReset().mockResolvedValue({});
  auditMock.mockReset();
  broadcastMock.mockReset();
}

const attendantSession = { userId: "att-1", name: "Maria", role: "room_attendant" as const };
const supervisorSession = { userId: "sup-1", name: "Diana", role: "supervisor" as const };

describe("applyStatusChange — guest DND gate", () => {
  it("blocks a room_attendant from starting a room with an active guest DND", async () => {
    reset();
    guestRequestFindFirst.mockResolvedValue({ id: "req-1", kind: "DND", status: "RECEIVED" });

    const result = await applyStatusChange(attendantSession, room.id, { status: "IN_PROGRESS" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain("Do Not Disturb");
    }
    expect(roomUpdate).not.toHaveBeenCalled();
    expect(guestRequestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: "room-1", kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } } })
    );
  });

  it("lets a room_attendant start a room with no active guest DND", async () => {
    reset();
    guestRequestFindFirst.mockResolvedValue(null);

    const result = await applyStatusChange(attendantSession, room.id, { status: "IN_PROGRESS" });
    expect(result.ok).toBe(true);
    expect(roomUpdate).toHaveBeenCalled();
  });

  it("lets a supervisor override an active guest DND (never even checks it)", async () => {
    reset();
    guestRequestFindFirst.mockResolvedValue({ id: "req-1", kind: "DND", status: "RECEIVED" });

    const result = await applyStatusChange(supervisorSession, room.id, { status: "IN_PROGRESS" });
    expect(result.ok).toBe(true);
    expect(guestRequestFindFirst).not.toHaveBeenCalled();
    expect(roomUpdate).toHaveBeenCalled();
  });
});
