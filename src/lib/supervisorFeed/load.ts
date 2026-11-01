import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { buildFeed, FEED_AUDIT_ACTIONS, FEED_NOTIFICATION_TYPES, type FeedItem, type RawFeedEvent } from "./rules";

/** Höchstens so viele Roh-Ereignisse je Quelle lesen (vor dem Zusammenfassen). */
const RAW_CAP = 600;

/** Nur Enum-Felder aus `meta` — nie `note`/Freitext/Fotopfad. */
function metaEnums(raw: string | null): { role?: string; blockReason?: string; category?: string } {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && /^[A-Z_a-z]{1,40}$/.test(v) ? v : undefined);
    return { role: str(m.role), blockReason: str(m.blockReason), category: str(m.category) };
  } catch {
    return {};
  }
}

/**
 * Feed „Das ist jetzt wichtig“ für bestimmte Etagen, heute (Berliner Kalendertag). Leere Etagenliste → leerer Feed.
 * `viewerId`: persönliche Meldungen (Notification.targetUserId) anderer Personen erscheinen nie.
 */
export async function loadFeed(floors: number[], viewerId: string, limit: number, now = new Date()): Promise<{ items: FeedItem[]; hasMore: boolean }> {
  if (!floors.length) return { items: [], hasMore: false };
  const since = berlinToUtc(berlinDate(now), "00:00");
  const rooms = await prisma.room.findMany({ where: { floor: { in: floors } }, select: { id: true, number: true, floor: true } });
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomIds = rooms.map((r) => r.id);
  const [audits, notes] = await Promise.all([
    prisma.auditLog.findMany({
      where: { roomId: { in: roomIds }, createdAt: { gte: since }, action: { in: FEED_AUDIT_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: RAW_CAP,
      select: { id: true, action: true, fromStatus: true, toStatus: true, roomId: true, meta: true, createdAt: true, user: { select: { name: true, role: true, email: true } } },
    }),
    prisma.notification.findMany({
      where: { roomId: { in: roomIds }, createdAt: { gte: since }, type: { in: FEED_NOTIFICATION_TYPES }, OR: [{ targetUserId: null }, { targetUserId: viewerId }] },
      orderBy: { createdAt: "desc" },
      take: RAW_CAP,
      select: { id: true, type: true, roomId: true, createdAt: true },
    }),
  ]);
  const events: RawFeedEvent[] = [];
  for (const a of audits) {
    const room = a.roomId ? roomById.get(a.roomId) : undefined;
    if (!room) continue;
    const meta = metaEnums(a.meta);
    const guest = a.user?.email === GUEST_SYSTEM_EMAIL || a.action.startsWith("GUEST_");
    events.push({
      id: a.id, at: a.createdAt.toISOString(), action: a.action, fromStatus: a.fromStatus, toStatus: a.toStatus,
      roomId: room.id, roomNumber: room.number, floor: room.floor,
      actorRole: guest ? "guest" : meta.role ?? a.user?.role ?? null,
      actorName: guest ? null : a.user?.name ?? null,
      blockReason: meta.blockReason ?? null, defectCategory: meta.category ?? null,
    });
  }
  for (const n of notes) {
    const room = n.roomId ? roomById.get(n.roomId) : undefined;
    if (!room) continue;
    events.push({ id: n.id, at: n.createdAt.toISOString(), action: `NOTIFICATION:${n.type}`, roomId: room.id, roomNumber: room.number, floor: room.floor, actorRole: "system" });
  }
  return buildFeed(events, floors, now, limit);
}
