import { describe, expect, it, vi } from "vitest";

/**
 * DSGVO retention (src/lib/guestDataRetention.ts): closed guest tickets,
 * guest-reported defect photos, and guest-authored room notes are purged
 * once both closed AND past Setting.guestDataRetentionDays. Mocks are reset
 * inline per `it()` (not in a shared beforeEach) per the CLAUDE.md note on
 * throwing/rejecting vi.fn() mocks and Vitest's unhandled-rejection
 * misattribution — the unlink-failure test below is exactly that case.
 */

const guestRequestDeleteMany = vi.fn();
const defectFindMany = vi.fn();
const defectUpdateMany = vi.fn();
const roomNoteDeleteMany = vi.fn();
const auditMock = vi.fn();
const getSettingsMock = vi.fn();
const getGuestSystemUserIdMock = vi.fn();
const unlinkMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    guestRequest: { deleteMany: (...args: unknown[]) => guestRequestDeleteMany(...args) },
    defect: {
      findMany: (...args: unknown[]) => defectFindMany(...args),
      updateMany: (...args: unknown[]) => defectUpdateMany(...args),
    },
    roomNote: { deleteMany: (...args: unknown[]) => roomNoteDeleteMany(...args) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
vi.mock("@/lib/settings", () => ({ getSettings: (...args: unknown[]) => getSettingsMock(...args) }));
vi.mock("@/lib/guestServer", () => ({ getGuestSystemUserId: (...args: unknown[]) => getGuestSystemUserIdMock(...args) }));
vi.mock("fs/promises", () => ({ unlink: (...args: unknown[]) => unlinkMock(...args) }));

import { runGuestDataRetention } from "@/lib/guestDataRetention";

const NOW = new Date("2026-09-29T12:00:00Z");
const CUTOFF = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);

describe("runGuestDataRetention", () => {
  it("deletes only DONE/CANCELLED GuestRequest rows older than the cutoff", async () => {
    getSettingsMock.mockReset().mockResolvedValue({ guestDataRetentionDays: 30 });
    getGuestSystemUserIdMock.mockReset().mockResolvedValue("guest-system-1");
    guestRequestDeleteMany.mockReset().mockResolvedValue({ count: 3 });
    defectFindMany.mockReset().mockResolvedValue([]);
    roomNoteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    auditMock.mockReset();

    const result = await runGuestDataRetention(NOW);

    expect(guestRequestDeleteMany).toHaveBeenCalledWith({
      where: { status: { in: ["DONE", "CANCELLED"] }, createdAt: { lt: CUTOFF } },
    });
    expect(result.guestRequestsDeleted).toBe(3);
  });

  it("removes the photo file and clears photoPath for expired guest-reported defects", async () => {
    getSettingsMock.mockReset().mockResolvedValue({ guestDataRetentionDays: 30 });
    getGuestSystemUserIdMock.mockReset().mockResolvedValue("guest-system-1");
    guestRequestDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    defectFindMany.mockReset().mockResolvedValue([
      { id: "defect-1", photoPath: "/api/uploads/defect-101-123.jpg" },
      { id: "defect-2", photoPath: "/api/uploads/defect-102-456.png" },
    ]);
    defectUpdateMany.mockReset().mockResolvedValue({ count: 2 });
    roomNoteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    unlinkMock.mockReset().mockResolvedValue(undefined);
    auditMock.mockReset();

    const result = await runGuestDataRetention(NOW);

    expect(defectFindMany).toHaveBeenCalledWith({
      where: { reportedById: "guest-system-1", photoPath: { not: null }, createdAt: { lt: CUTOFF } },
      select: { id: true, photoPath: true },
    });
    expect(unlinkMock).toHaveBeenCalledTimes(2);
    expect(unlinkMock.mock.calls[0][0]).toMatch(/uploads[/\\]defect-101-123\.jpg$/);
    expect(defectUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["defect-1", "defect-2"] } },
      data: { photoPath: null },
    });
    expect(result.defectPhotosRemoved).toBe(2);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GUEST_DATA_RETENTION_RUN" })
    );
  });

  it("clears photoPath even when the file is already gone on disk", async () => {
    getSettingsMock.mockReset().mockResolvedValue({ guestDataRetentionDays: 30 });
    getGuestSystemUserIdMock.mockReset().mockResolvedValue("guest-system-1");
    guestRequestDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    defectFindMany.mockReset().mockResolvedValue([{ id: "defect-1", photoPath: "/api/uploads/gone.jpg" }]);
    defectUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    roomNoteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    unlinkMock.mockReset().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    auditMock.mockReset();

    const result = await runGuestDataRetention(NOW);

    expect(result.defectPhotosRemoved).toBe(1);
    expect(defectUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["defect-1"] } },
      data: { photoPath: null },
    });
  });

  it("deletes only guest-authored, DONE RoomNote rows older than the cutoff", async () => {
    getSettingsMock.mockReset().mockResolvedValue({ guestDataRetentionDays: 30 });
    getGuestSystemUserIdMock.mockReset().mockResolvedValue("guest-system-1");
    guestRequestDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    defectFindMany.mockReset().mockResolvedValue([]);
    roomNoteDeleteMany.mockReset().mockResolvedValue({ count: 5 });
    auditMock.mockReset();

    const result = await runGuestDataRetention(NOW);

    expect(roomNoteDeleteMany).toHaveBeenCalledWith({
      where: { authorId: "guest-system-1", status: "DONE", createdAt: { lt: CUTOFF } },
    });
    expect(result.roomNotesDeleted).toBe(5);
  });

  it("skips the audit entry when nothing was purged", async () => {
    getSettingsMock.mockReset().mockResolvedValue({ guestDataRetentionDays: 30 });
    getGuestSystemUserIdMock.mockReset().mockResolvedValue("guest-system-1");
    guestRequestDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    defectFindMany.mockReset().mockResolvedValue([]);
    roomNoteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    auditMock.mockReset();

    await runGuestDataRetention(NOW);

    expect(auditMock).not.toHaveBeenCalled();
  });

  it("honors a house-configured retention window", async () => {
    getSettingsMock.mockReset().mockResolvedValue({ guestDataRetentionDays: 7 });
    getGuestSystemUserIdMock.mockReset().mockResolvedValue("guest-system-1");
    guestRequestDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    defectFindMany.mockReset().mockResolvedValue([]);
    roomNoteDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    auditMock.mockReset();

    await runGuestDataRetention(NOW);

    const shortCutoff = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(guestRequestDeleteMany).toHaveBeenCalledWith({
      where: { status: { in: ["DONE", "CANCELLED"] }, createdAt: { lt: shortCutoff } },
    });
  });
});
