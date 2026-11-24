import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";
import { resolveStayByToken, roomStayState } from "@/lib/guestStay";
import { berlinToday } from "@/lib/import/businessDay";
import { broadcast } from "@/lib/realtime";
import { keyed } from "@/lib/i18n/notificationText";

/** Server-only counterpart to src/lib/guest.ts — small lookups shared by every guest API route. */

export interface GuestAccess {
  room: { id: string; number: string; floor: number };
  stay: {
    id: string;
    guestName: string;
    guestSalutation?: string | null;
    guestTitle?: string | null;
    guestLastName?: string | null;
    language: string;
    checkIn: Date;
    checkOut: Date;
    status: string;
  };
}

/**
 * NFC/QR entry point (Prompt G2 Teil 2, S1): resolves a room's fixed access code to whichever Stay is active for
 * this room right now (src/lib/guestStay.ts) — never to the room by itself. No active stay means no access, same
 * as an unknown code. Two stays IN_HOUSE at once: no access either, and the Duty Manager is warned once a day.
 */
export async function resolveGuestAccessByRoomCode(roomParam: string): Promise<GuestAccess | null> {
  const { code: roomCode, ref } = splitRoomParam(roomParam);
  const room = await prisma.room.findUnique({ where: { guestAccessCode: roomCode } });
  if (!room) return null;
  const state = await roomStayState(room.id);
  if (state.kind === "conflict") {
    await warnStayConflict(room).catch(() => null);
    return null;
  }
  if (state.kind !== "active") return null;
  // F9 (A3): an einen Aufenthalt gebundene Adresse (`<code>.<ref>`) gilt nur, solange genau dieser Aufenthalt aktiv ist —
  // der offene Tab des Vorgasts sieht so nie den nächsten Gast.
  if (ref !== null && ref !== stayRef(state.stay.id)) return null;
  return { room, stay: state.stay };
}

/**
 * F9 (A3): Kennung eines Aufenthalts für die Gastseite — abgeleitet, nicht umkehrbar, ohne Gastdaten. Die Seite hängt sie
 * an ihre API-Adresse (`/api/guest/r/<code>.<ref>/…`), damit Status und Aktionen nur für *ihren* Aufenthalt gelten.
 */
export function stayRef(stayId: string): string {
  return createHash("sha256").update(`guest-stay:${stayId}`).digest("base64url").slice(0, 16);
}

/** Zimmer-Code ist base64url (nie ein Punkt) — alles nach dem ersten Punkt ist die Aufenthalts-Kennung. */
export function splitRoomParam(param: string): { code: string; ref: string | null } {
  const i = param.indexOf(".");
  return i < 0 ? { code: param, ref: null } : { code: param.slice(0, i), ref: param.slice(i + 1) };
}

/** Pre-arrival / personal link entry point (Prompt G2 Teil 2): resolves straight off the Stay's own token. */
export async function resolveGuestAccessByStayToken(stayToken: string): Promise<GuestAccess | null> {
  const stay = await resolveStayByToken(stayToken);
  if (!stay) return null;
  const { room, ...stayOnly } = stay;
  return { room, stay: stayOnly };
}

/** Duty Manager: zwei Aufenthalte gleichzeitig „im Haus“ — der Gastbildschirm bleibt neutral. Ohne Gastnamen. */
async function warnStayConflict(room: { id: string; number: string; floor: number }) {
  const dedupeKey = `GUEST_STAY_CONFLICT:${room.id}:${berlinToday()}`;
  if (await prisma.notification.findFirst({ where: { dedupeKey } })) return;
  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_STAY_CONFLICT",
      level: "warning",
      targetRole: "duty_manager",
      roomId: room.id,
      message: `Zimmer ${room.number}: zwei Aufenthalte gleichzeitig „im Haus“ — Gastbildschirm bleibt neutral. Bitte Import/Check-out prüfen.`,
      ...keyed("notify.guestStayConflict", { n: room.number }),
      dedupeKey,
    },
  });
  broadcast("notification:new", { notification });
}

export async function getGuestSystemUserId(): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email: GUEST_SYSTEM_EMAIL } });
  if (!user) throw new Error(`Guest system account (${GUEST_SYSTEM_EMAIL}) is not seeded — run the seed script.`);
  return user.id;
}
