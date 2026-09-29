import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/uploads/[...path] — the only way to read a defect photo (DSGVO:
 * never a publicly reachable static file). Any signed-in staff member may
 * view one; the interesting behavior to pin down is the auth gate and the
 * path-traversal rejection.
 */

const requireAuthMock = vi.fn();
const readFileMock = vi.fn();

vi.mock("@/lib/rbac", () => ({ requireAuth: (...args: unknown[]) => requireAuthMock(...args) }));
vi.mock("fs/promises", () => ({ readFile: (...args: unknown[]) => readFileMock(...args) }));

import { GET } from "@/app/api/uploads/[...path]/route";

const staffAuth = { ok: true as const, session: { userId: "u-1", name: "Ana", role: "supervisor" as const } };

function req() {
  return new NextRequest("http://localhost/api/uploads/defect-101-123.jpg");
}

describe("GET /api/uploads/[...path]", () => {
  it("401s when not signed in", async () => {
    requireAuthMock.mockReset().mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    const res = await GET(req(), { params: Promise.resolve({ path: ["defect-101-123.jpg"] }) });
    expect(res.status).toBe(401);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("rejects a path segment containing '..'", async () => {
    requireAuthMock.mockReset().mockResolvedValue(staffAuth);
    readFileMock.mockReset();

    const res = await GET(req(), { params: Promise.resolve({ path: ["..", "..", "etc", "passwd"] }) });
    expect(res.status).toBe(400);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("rejects a segment that embeds a slash", async () => {
    requireAuthMock.mockReset().mockResolvedValue(staffAuth);
    readFileMock.mockReset();

    const res = await GET(req(), { params: Promise.resolve({ path: ["sub/../../secret"] }) });
    expect(res.status).toBe(400);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("404s when the file does not exist on disk", async () => {
    requireAuthMock.mockReset().mockResolvedValue(staffAuth);
    readFileMock.mockReset().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const res = await GET(req(), { params: Promise.resolve({ path: ["missing.jpg"] }) });
    expect(res.status).toBe(404);
  });

  it("serves the file with the right content-type for a signed-in staff member", async () => {
    requireAuthMock.mockReset().mockResolvedValue(staffAuth);
    readFileMock.mockReset().mockResolvedValue(Buffer.from("fake-jpeg-bytes"));

    const res = await GET(req(), { params: Promise.resolve({ path: ["defect-101-123.jpg"] }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });
});
