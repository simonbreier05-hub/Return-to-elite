import { now as clockNow } from "@/lib/clock";
import { prisma } from "@/lib/db";
import { getGuestSystemUserId } from "@/lib/guestServer";

/**
 * Everything a guest submitted for their room, unified into one simple
 * status (Prompt G2 Teil 3: "Nach dem Senden: einfacher Status
 * Eingegangen / In Bearbeitung / Erledigt"). Labels are deliberately
 * untranslated data (kind + detail) — the client renders them in whichever
 * language the guest screen is currently showing. Never includes anything
 * staff-authored: notes/defects are filtered to the guest system account,
 * so no internal note or another guest's submission can leak through.
 */

export type GuestStatus = "RECEIVED" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type GuestRequestKind = "DND" | "CLEAN_REQUEST" | "CONTACT" | "DEFECT" | "NOTE" | "GREEN"; // GREEN = Betrieb L2 Green Option

export interface GuestStatusItem {
  id: string;
  kind: GuestRequestKind;
  detail: string | null;
  status: GuestStatus;
  createdAt: string;
}

const FEED_WINDOW_MS = 24 * 60 * 60 * 1000;
const FEED_LIMIT = 20;

const WORK_ORDER_TO_GUEST_STATUS: Record<string, GuestStatus> = {
  OPEN: "RECEIVED",
  ACK: "IN_PROGRESS",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "DONE",
};
const NOTE_TO_GUEST_STATUS: Record<string, GuestStatus> = { OPEN: "RECEIVED", DONE: "DONE" };

/**
 * S1: Der Verlauf beginnt frühestens mit dem letzten Check-out in diesem Zimmer — ein neuer Gast sieht nie die
 * Anfragen oder Notizen des Vorgasts (Same-Day-Turn). Quelle: Logbuch GUEST_CHECKED_OUT (Check-out-Route).
 */
export async function getGuestStatusFeed(roomId: string, now: Date = clockNow()): Promise<{
  items: GuestStatusItem[];
  activeDnd: { id: string; detail: string | null } | null;
}> {
  const guestUserId = await getGuestSystemUserId();
  const lastCheckout = await prisma.auditLog.findFirst({
    where: { roomId, action: { in: ["GUEST_CHECKED_OUT", "GUEST_DEPARTED_IMPORT"] } }, // Review (M1): auch Abschluss über den Import
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const windowStart = now.getTime() - FEED_WINDOW_MS;
  const since = new Date(Math.max(windowStart, lastCheckout?.createdAt.getTime() ?? 0));

  const [requests, notes, defects] = await Promise.all([
    prisma.guestRequest.findMany({
      where: { roomId, archivedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
    }),
    prisma.roomNote.findMany({
      where: { roomId, authorId: guestUserId, archivedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
    }),
    prisma.defect.findMany({
      where: { roomId, reportedById: guestUserId, createdAt: { gte: since } },
      include: { workOrder: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
    }),
  ]);

  const items: GuestStatusItem[] = [
    ...requests.map((r) => ({
      id: r.id,
      kind: r.kind as GuestRequestKind,
      detail: r.detail,
      status: r.status as GuestStatus,
      createdAt: r.createdAt.toISOString(),
    })),
    ...notes.map((n) => ({
      id: n.id,
      kind: "NOTE" as const,
      detail: n.body,
      status: NOTE_TO_GUEST_STATUS[n.status] ?? "RECEIVED",
      createdAt: n.createdAt.toISOString(),
    })),
    ...defects.map((d) => ({
      id: d.id,
      kind: "DEFECT" as const,
      detail: d.category,
      status: WORK_ORDER_TO_GUEST_STATUS[d.workOrder?.status ?? "OPEN"] ?? "RECEIVED",
      createdAt: d.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const activeDndRequest = requests.find((r) => r.kind === "DND" && (r.status === "RECEIVED" || r.status === "IN_PROGRESS"));

  return {
    items,
    activeDnd: activeDndRequest ? { id: activeDndRequest.id, detail: activeDndRequest.detail } : null,
  };
}
