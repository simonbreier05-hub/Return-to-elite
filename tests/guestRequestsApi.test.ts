import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/guest-requests (Prompt G2 Teil 4: "Supervisor kann Gästeanfragen
 * einsehen, zuweisen, als erledigt markieren"). requireRole()'s own
 * behavior is covered generically by tests/rbac.test.ts — these tests
 * exercise the route's own logic once past that gate.
 */

const requireRoleMock = vi.fn();
const guestRequestFindMany = vi.fn();
const guestRequestFindUnique = vi.fn();
const guestRequestUpdate = vi.fn();
const userFindUnique = vi.fn();
const auditMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock("@/lib/rbac", () => ({ requireRole: (...args: unknown[]) => requireRoleMock(...args) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    guestRequest: {
      findMany: (...args: unknown[]) => guestRequestFindMany(...args),
      findUnique: (...args: unknown[]) => guestRequestFindUnique(...args),
      update: (...args: unknown[]) => guestRequestUpdate(...args),
    },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/realtime", () => ({ broadcast: (...args: unknown[]) => broadcastMock(...args) }));

import { GET } from "@/app/api/guest-requests/route";
import { PATCH } from "@/app/api/guest-requests/[id]/route";

const supervisorAuth = { ok: true as const, session: { userId: "sup-1", name: "Diana", role: "supervisor" as const } };

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/guest-requests/req-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/guest-requests", () => {
  it("defaults to still-open requests only", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);
    guestRequestFindMany.mockReset().mockResolvedValue([]);

    await GET(new NextRequest("http://localhost/api/guest-requests"));
    expect(guestRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["RECEIVED", "IN_PROGRESS"] } } })
    );
  });

  it("includes everything when ?all=1", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);
    guestRequestFindMany.mockReset().mockResolvedValue([]);

    await GET(new NextRequest("http://localhost/api/guest-requests?all=1"));
    expect(guestRequestFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe("PATCH /api/guest-requests/[id]", () => {
  it("rejects a body with neither status nor assignedToId", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);

    const res = await PATCH(patchRequest({}), { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(400);
    expect(guestRequestUpdate).not.toHaveBeenCalled();
  });

  it("404s for an unknown request", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);
    guestRequestFindUnique.mockReset().mockResolvedValue(null);

    const res = await PATCH(patchRequest({ status: "DONE" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("rejects an assignedToId that doesn't reference a real user", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);
    guestRequestFindUnique.mockReset().mockResolvedValue({ id: "req-1", roomId: "room-1", status: "RECEIVED" });
    userFindUnique.mockReset().mockResolvedValue(null);

    const res = await PATCH(patchRequest({ assignedToId: "nope" }), { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(400);
    expect(guestRequestUpdate).not.toHaveBeenCalled();
  });

  it("marks a request DONE, audits it, and broadcasts the update", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);
    guestRequestFindUnique.mockReset().mockResolvedValue({ id: "req-1", roomId: "room-1", status: "RECEIVED" });
    guestRequestUpdate.mockReset().mockResolvedValue({ id: "req-1", status: "DONE" });
    auditMock.mockReset();
    broadcastMock.mockReset();

    const res = await PATCH(patchRequest({ status: "DONE" }), { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(200);

    expect(guestRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req-1" }, data: { status: "DONE" } })
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GUEST_REQUEST_UPDATED", roomId: "room-1", fromStatus: "RECEIVED", toStatus: "DONE" })
    );
    expect(broadcastMock).toHaveBeenCalledWith("guestrequest:update", expect.anything());
  });

  it("claiming (assignedToId only) does not require a status change", async () => {
    requireRoleMock.mockReset().mockResolvedValue(supervisorAuth);
    guestRequestFindUnique.mockReset().mockResolvedValue({ id: "req-1", roomId: "room-1", status: "RECEIVED" });
    userFindUnique.mockReset().mockResolvedValue({ id: "sup-1" });
    guestRequestUpdate.mockReset().mockResolvedValue({ id: "req-1", assignedToId: "sup-1" });

    const res = await PATCH(patchRequest({ assignedToId: "sup-1" }), { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(200);
    expect(guestRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req-1" }, data: { assignedToId: "sup-1" } })
    );
  });
});
