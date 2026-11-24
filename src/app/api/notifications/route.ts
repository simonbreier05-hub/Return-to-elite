import { now as clockNow } from "@/lib/clock";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { broadcast } from "@/lib/realtime";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";

/**
 * GET /api/notifications — alerts for my role (duty_manager sees all).
 * POST — supervisor raises one to duty_manager (currently just the
 * "need more Room Attendants" ask from the planning board).
 * PATCH — mark one ({id}) or all ({all:true}) visible alerts as read **for me**.
 *
 * „Gelesen“ gilt je Person (`NotificationRead`, Paket O1): wer quittiert, ändert nur die eigene Glocke — auch eine
 * Rollen-Meldung bleibt für die Kolleginnen ungelesen, und das „Alle gelesen“ des Duty Managers berührt niemanden sonst.
 * `acknowledged` in der Antwort = von mir gelesen (oder Altbestand `Notification.acknowledged` von vor O1).
 */
/** Meldungen für mich: meine Rolle, und wenn eine Meldung an eine Person gerichtet ist, nur wenn ich es bin (Duty Manager sieht alle). */
function scopeFor(session: { role: string; userId: string }) {
  return session.role === "duty_manager" ? {} : { targetRole: session.role, OR: [{ targetUserId: null }, { targetUserId: session.userId }] };
}

/**
 * F5 (M2): seitenweise statt fester Deckel — `?before=<ISO>` lädt die nächste Seite (älter als dieser Zeitpunkt), `?limit=` (1–200,
 * Standard 60), `?urgent=1` nur dringende (warning/critical). `nextBefore` = Zeitpunkt für die nächste Seite oder null.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const q = req?.nextUrl?.searchParams; // ältere Aufrufer (Tests) ohne Request: erste Seite
  const limit = Math.min(200, Math.max(1, Number(q?.get("limit")) || PAGE));
  // Cursor „Zeit|Id“ — gleiche Zeitstempel (Massen-Check-out) werden nicht übersprungen
  const [beforeIso, beforeId] = (q?.get("before") ?? "").split("|");
  const before = beforeIso ? new Date(beforeIso) : null;
  const cursor = before && !Number.isNaN(before.getTime())
    ? { OR: [{ createdAt: { lt: before } }, ...(beforeId ? [{ createdAt: before, id: { lt: beforeId } }] : [])] } : {};
  const urgent = q?.get("urgent") === "1";
  const rows = await prisma.notification.findMany({
    where: { AND: [scopeFor(auth.session), cursor, urgent ? { level: { in: ["warning", "critical"] } } : {}] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { reads: { where: { userId: auth.session.userId }, select: { id: true } } },
  });
  const page = rows.slice(0, limit);
  const notifications = page.map(({ reads, ...n }) => ({ ...n, acknowledged: n.acknowledged || reads.length > 0 }));
  const last = page[page.length - 1];
  const nextBefore = rows.length > limit ? `${last.createdAt.toISOString()}|${last.id}` : null;
  // `me`: damit der Client „an mich gerichtet“ (Pop-up, Ton, Zähler) ohne eigene Abfrage entscheiden kann.
  return NextResponse.json({ notifications, nextBefore, me: { role: auth.session.role, userId: auth.session.userId } });
}
const PAGE = 60;

const StaffingRequestBody = z.object({
  message: z.string().trim().min(1).max(500),
});

/** POST /api/notifications — supervisor asks the duty manager for more hands. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = StaffingRequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "message is required.", code: "TEXT_REQUIRED" }, { status: 400 });

  const notification = await prisma.notification.create({
    data: {
      type: "STAFFING_REQUEST",
      level: "warning",
      targetRole: "duty_manager",
      message: parsed.data.message,
    },
  });
  broadcast("notification:new", { notification });
  return NextResponse.json({ notification }, { status: 201 });
}

// F5 (M2): `{olderThanToday:true}` = „Alte schließen“ — alles vor dem heutigen Betriebstag (Berlin) als gelesen
const Body = z.union([z.object({ id: z.string() }), z.object({ all: z.literal(true) }), z.object({ olderThanToday: z.literal(true) })]);

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pass {id} or {all:true}.", code: "INVALID_INPUT" }, { status: 400 });

  const { userId } = auth.session;
  // Nur Meldungen, die ich sehen darf; schon gelesene (von mir oder Altbestand) auslassen.
  const unread = await prisma.notification.findMany({
    where: { ...scopeFor(auth.session), ...("id" in parsed.data ? { id: parsed.data.id } : {}), ...("olderThanToday" in parsed.data ? { createdAt: { lt: berlinToUtc(berlinDate(clockNow()), "00:00") } } : {}), acknowledged: false, reads: { none: { userId } } },
    select: { id: true },
  });
  if (unread.length) {
    try {
      await prisma.notificationRead.createMany({ data: unread.map((n) => ({ notificationId: n.id, userId })) });
    } catch {
      // Doppelklick/zweites Gerät gleichzeitig: einzelne Zeile existiert schon — einzeln nachziehen.
      for (const n of unread) await prisma.notificationRead.upsert({ where: { notificationId_userId: { notificationId: n.id, userId } }, create: { notificationId: n.id, userId }, update: {} });
    }
  }
  return NextResponse.json({ ok: true });
}
