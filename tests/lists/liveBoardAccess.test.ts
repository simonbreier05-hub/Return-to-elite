import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
const redirectMock = vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); });
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirectMock(to) }));

import { requirePage } from "@/lib/pageGuard";

const src = readFileSync(path.join(__dirname, "..", "..", "src/app/supervisor/page.tsx"), "utf8");

describe("Live-Board nur für Supervisor und Duty Manager", () => {
  it("die Seite verlangt die Rolle Supervisor (Duty Manager passt immer)", () => {
    expect(src).toMatch(/requirePage\(\["supervisor"\]\)/);
  });
  for (const role of ["room_attendant", "houseman", "front_office", "concierge", "engineering"]) {
    it(`${role} wird weggeleitet`, async () => {
      redirectMock.mockClear(); getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: "u", name: "x", role });
      await expect(requirePage(["supervisor"])).rejects.toThrow("REDIRECT:/");
    });
  }
  it("ohne Anmeldung → Login", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue(null);
    await expect(requirePage(["supervisor"])).rejects.toThrow("REDIRECT:/login");
  });
  it("Supervisor und Duty Manager kommen durch", async () => {
    for (const role of ["supervisor", "duty_manager"]) {
      getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: "u", name: "x", role });
      await expect(requirePage(["supervisor"])).resolves.toMatchObject({ role });
    }
  });
});
