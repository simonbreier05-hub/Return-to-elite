import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { getGuestSystemUserId } from "@/lib/guestServer";

/**
 * DSGVO retention — executed roughly hourly by the ticker in server.js (via
 * POST /api/internal/guest-data-retention). Purges guest-originated data
 * once it is both closed out AND older than Setting.guestDataRetentionDays
 * (default 30) since creation — never anything still open, so a request
 * nobody got around to closing can't silently vanish before it was handled.
 *
 * Scope (Prompt G2, Datenschutz):
 *  - GuestRequest (DND/CLEAN_REQUEST/CONTACT tickets): deleted outright once
 *    DONE/CANCELLED and past retention — no long-term value once resolved.
 *  - Defect photos reported via the guest screen: the file is removed from
 *    disk and Defect.photoPath is cleared. The Defect/WorkOrder row itself is
 *    kept — it's the technician team's maintenance history, not guest data —
 *    only the personal-image artifact is purged.
 *  - RoomNote freetext authored by the guest system account: deleted once
 *    DONE and past retention.
 *
 * AuditLog entries referencing any of the above are intentionally left
 * alone — the logbook is the house's own accountability record, a separate
 * retention question from the guest's own submitted content.
 */
export async function runGuestDataRetention(now = new Date()) {
  const settings = await getSettings();
  const cutoff = new Date(now.getTime() - settings.guestDataRetentionDays * 24 * 60 * 60 * 1000);
  const guestSystemUserId = await getGuestSystemUserId();

  const { count: guestRequestsDeleted } = await prisma.guestRequest.deleteMany({
    where: { status: { in: ["DONE", "CANCELLED"] }, createdAt: { lt: cutoff } },
  });

  const expiredPhotos = await prisma.defect.findMany({
    where: { reportedById: guestSystemUserId, photoPath: { not: null }, createdAt: { lt: cutoff } },
    select: { id: true, photoPath: true },
  });
  for (const defect of expiredPhotos) {
    if (!defect.photoPath) continue;
    const filename = defect.photoPath.split("/").pop();
    if (filename) {
      await unlink(path.join(process.cwd(), "uploads", filename)).catch(() => {
        // Already gone (or never written) — clearing the DB reference below still matters.
      });
    }
  }
  if (expiredPhotos.length > 0) {
    await prisma.defect.updateMany({
      where: { id: { in: expiredPhotos.map((d) => d.id) } },
      data: { photoPath: null },
    });
  }

  const { count: roomNotesDeleted } = await prisma.roomNote.deleteMany({
    where: { authorId: guestSystemUserId, status: "DONE", createdAt: { lt: cutoff } },
  });

  const result = { guestRequestsDeleted, defectPhotosRemoved: expiredPhotos.length, roomNotesDeleted };
  if (guestRequestsDeleted > 0 || expiredPhotos.length > 0 || roomNotesDeleted > 0) {
    await audit({ action: "GUEST_DATA_RETENTION_RUN", meta: { ...result, cutoff: cutoff.toISOString() } });
  }
  return result;
}
