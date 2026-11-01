import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
vi.mock("@/lib/rbac", () => ({ requireAuth: async () => ({ ok: true, session: { userId: "u1", name: "A", role: "room_attendant" } }) }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: (...a: unknown[]) => update(...a), findUnique: async () => ({ id: "u1", language: "vi" }) }, setting: { findMany: async () => [] } } }));
vi.mock("@/lib/audit", () => ({ audit: async () => {} }));

import { PATCH, GET } from "@/app/api/auth/me/route";

const req = (body: unknown) => new Request("http://x/api/auth/me", { method: "PATCH", body: JSON.stringify(body) }) as unknown as Parameters<typeof PATCH>[0];

describe("PATCH /api/auth/me (eigene Sprache)", () => {
  beforeEach(() => update.mockReset());
  it("speichert den Basiscode am Nutzer", async () => {
    update.mockReset();
    const res = await PATCH(req({ language: "vi-VN" }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { language: "vi" } });
  });
  it("null = zurück auf Hotel-Standard", async () => {
    update.mockReset();
    await PATCH(req({ language: null }));
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { language: null } });
  });
  it("unbekannte Sprache: Fehlercode, nichts gespeichert", async () => {
    update.mockReset();
    const res = await PATCH(req({ language: "klingon" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNKNOWN_LANGUAGE");
    expect(update).not.toHaveBeenCalled();
  });
  it("GET liefert Sprache und Hotel-Standard", async () => {
    const data = await (await GET()).json();
    expect(data.user.language).toBe("vi");
    expect(data.hotelDefaultLanguage).toBe("de");
  });
});
