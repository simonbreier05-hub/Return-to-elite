import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * requireRole() is what every RBAC-gated route (including the
 * duty-manager-screen additions: POST /api/roomtasks now accepting
 * duty_manager, PATCH /api/users/[id]/floors requiring it) relies on for its
 * "duty_manager is the admin role and passes every check" behavior — see the
 * doc comment on requireRole itself. Verified directly here rather than
 * per-route, since every route defers to this one function.
 */

const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...args: unknown[]) => getSessionMock(...args) }));

import { requireRole } from "@/lib/rbac";

describe("requireRole", () => {
  beforeEach(() => getSessionMock.mockReset());

  it("allows a role explicitly listed", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", name: "Sofia", role: "supervisor" });
    const auth = await requireRole(["supervisor", "duty_manager"]);
    expect(auth.ok).toBe(true);
  });

  it("allows duty_manager even when the roles list doesn't mention it", async () => {
    getSessionMock.mockResolvedValue({ userId: "u2", name: "Diana", role: "duty_manager" });
    const auth = await requireRole(["houseman"]);
    expect(auth.ok).toBe(true);
  });

  it("denies a role that is neither listed nor duty_manager", async () => {
    getSessionMock.mockResolvedValue({ userId: "u3", name: "Felix", role: "front_office" });
    const auth = await requireRole(["supervisor", "duty_manager"]);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(403);
  });

  it("denies an unauthenticated request regardless of the roles list", async () => {
    getSessionMock.mockResolvedValue(null);
    const auth = await requireRole(["duty_manager"]);
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });
});
