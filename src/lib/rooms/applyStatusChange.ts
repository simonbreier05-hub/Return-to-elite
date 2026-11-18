import { prisma } from "@/lib/db";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { RoomStatusSchema, type BlockReason, type RoomStatus } from "@/lib/domain";
import { checkTransition, SELL_BLOCKED } from "@/lib/stateMachine";
import { notifyFloorLeads } from "@/lib/rooms/notifyLeads";
import { deleteResolvedDefectPhotos } from "@/lib/rooms/defectPhotoCleanup";
import { alertVipLate } from "@/lib/notify/dmAlerts";
import { arrivalTodayWhere } from "@/lib/rooms/blockedRooms";
import { previousGuest, previousGuestText } from "@/lib/rooms/previousGuest";
import { pms } from "@/lib/pms/MockPMSConnector";
import type { Session } from "@/lib/auth";
import { endPauseOnChange } from "@/lib/work/pauseData";
import { keyed } from "@/lib/i18n/notificationText";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";

/**
 * The one place a room's status is allowed to change.
 *
 * Both the single-room endpoint and the bulk release go through here. That is
 * deliberate: the rule that only a supervisor may release a room is the core of
 * this system, and a second copy of it is a second chance to get it wrong.
 *
 * Side effects that belong to a status change — the audit entry (including for
 * refusals), the attendant's live location, the PMS push, the front-office
 * notification and the realtime broadcast — all live here too, so a bulk
 * release behaves exactly like sixteen individual ones.
 */

export interface StatusChangeInput {
  status: RoomStatus;
  blockReason?: BlockReason;
  note?: string;
  oooUntil?: Date;
  /** F2: Sperrgrund (Pflicht bei OUT_OF_ORDER, kurzer Text, keine Gastdaten). */
  oooReason?: string;
  /** F2: Sperre eines belegten Zimmers bzw. eines Zimmers mit Anreise heute ist bestätigt (sonst 409 mit Rückfrage). */
  confirmOccupied?: boolean;
  /** F3 (K4, H10): Start/Freigabe trotz „Gast laut Front Office noch im Zimmer“ bestätigt (Annahme: Warnung, keine Sperre). */
  confirmGuestPresent?: boolean;
  /** F6 (M19): Wäschewechsel beim Fertigmelden ausdrücklich bestätigt — nur dann wird er gebucht (nie automatisch). */
  laundryChanged?: boolean;
}

export type StatusChangeResult =
  | { ok: true; room: Awaited<ReturnType<typeof updateRoom>> }
  | { ok: false; status: number; error: string; code?: string; data?: Record<string, unknown> };

function updateRoom(id: string, data: Parameters<typeof prisma.room.update>[0]["data"]) {
  return prisma.room.update({
    where: { id },
    data,
    include: { assignedTo: { select: { id: true, name: true } } },
  });
}

/** F2: Ist das Zimmer belegt (Board) oder kommt heute ein Gast (erwartete Anreise / Tagesplan Anreise oder Turn)? */
export async function occupancyOf(room: { id: string; occupancy: string }, now = new Date()): Promise<{ occupied: boolean; arrivalToday: boolean }> {
  const date = berlinDate(now);
  const [arrival, plan] = await Promise.all([
    prisma.arrival.findFirst({ where: { roomId: room.id, ...arrivalTodayWhere(now) }, select: { id: true } }),
    prisma.dayRoomPlan.findFirst({ where: { date, roomId: room.id, cleaningType: { in: ["ARRIVAL", "SAME_DAY_TURN"] } }, select: { id: true } }),
  ]);
  return { occupied: room.occupancy === "OCCUPIED", arrivalToday: !!arrival || !!plan };
}

export async function applyStatusChange(
  session: Session,
  roomId: string,
  input: StatusChangeInput
): Promise<StatusChangeResult> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, status: 404, error: "Room not found.", code: "ROOM_NOT_FOUND" };

  const from = RoomStatusSchema.parse(room.status);
  const to = input.status;

  // --- State machine + RBAC. Every refusal is recorded, not just failures. ---
  const check = checkTransition(session.role, from, to);
  if (!check.ok) {
    await audit({
      action: "STATUS_CHANGE_DENIED",
      userId: session.userId,
      roomId: room.id,
      fromStatus: from,
      toStatus: to,
      meta: { reason: check.error, role: session.role },
    });
    return { ok: false, status: check.code, error: check.error, code: check.reason ?? (check.code === 403 ? "FORBIDDEN" : undefined) };
  }

  // --- Guest "Bitte nicht stören" (Prompt G2 Teil 4) --------------------
  // Deliberately not part of checkTransition/blockReason: guest DND never
  // touches Room.status (see src/lib/guestActions.ts), so this is checked
  // separately, only for the one transition it's meant to gate, and only
  // for the room attendant role — a supervisor/duty_manager starting the
  // room anyway is the explicit override the prompt asks for.
  if (to === "IN_PROGRESS" && session.role === "room_attendant") {
    const activeDnd = await prisma.guestRequest.findFirst({
      where: { roomId: room.id, kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } },
    });
    if (activeDnd) {
      await audit({
        action: "STATUS_CHANGE_DENIED",
        userId: session.userId,
        roomId: room.id,
        fromStatus: from,
        toStatus: to,
        meta: { reason: "guest DND active", role: session.role },
      });
      return {
        ok: false,
        status: 409,
        error: "Guest has Do Not Disturb active — a supervisor can override this.", code: "GUEST_DND_ACTIVE",
      };
    }
  }

  // --- F3 Teil 1: Vorgast noch im Zimmer (Abreise/Turn nicht ausgecheckt oder Late Check-out später) -----
  // Housekeeper-Start und Supervisor-Freigabe brauchen dann eine Bestätigung mit Klartext (Annahme: Warnung, keine Sperre).
  if ((to === "IN_PROGRESS" || to === "INSPECTED") && !input.confirmGuestPresent) {
    const prev = await previousGuest(room.id);
    if (prev.present) return { ok: false, status: 409, code: "GUEST_STILL_IN_ROOM", error: previousGuestText(room, prev), data: { lateCheckout: prev.lateCheckout } };
  }

  // --- Payload each target status requires ---------------------------------
  if (to === "BLOCKED" && !input.blockReason) {
    return {
      ok: false,
      status: 400,
      error: "BLOCKED requires a reason (DND | GUEST_IN_ROOM | DOUBLE_LOCKED | REFUSED).", code: "BLOCK_REASON_REQUIRED",
    };
  }
  if (to === "PICKUP" && !input.note?.trim()) {
    return { ok: false, status: 400, error: "PICKUP (rework) requires a note for the attendant.", code: "REWORK_NOTE_REQUIRED" };
  }
  if (to === "OUT_OF_ORDER" && !input.oooUntil) {
    return { ok: false, status: 400, error: "OUT_OF_ORDER requires an end time (oooUntil).", code: "OOO_END_REQUIRED" };
  }
  const oooReason = input.oooReason?.trim().slice(0, 200) ?? "";
  if (to === "OUT_OF_ORDER" && !oooReason) {
    return { ok: false, status: 400, error: "OUT_OF_ORDER requires a reason.", code: "OOO_REASON_REQUIRED" };
  }
  // F2 (entschieden): ein belegtes Zimmer bzw. eines mit Anreise heute wird nie still gesperrt — erst Rückfrage, dann Meldung.
  const occupancyRisk = to === "OUT_OF_ORDER" ? await occupancyOf(room) : { occupied: false, arrivalToday: false };
  if ((occupancyRisk.occupied || occupancyRisk.arrivalToday) && !input.confirmOccupied) {
    return {
      ok: false, status: 409, code: "OCCUPIED_CONFIRM_REQUIRED",
      error: occupancyRisk.occupied ? `Room ${room.number} is occupied — confirm the block.` : `Room ${room.number} has an arrival today — confirm the block.`,
    };
  }

  const now = new Date();
  const updated = await updateRoom(room.id, {
    status: to,
    statusSince: now,
    blockReason: to === "BLOCKED" ? input.blockReason : null,
    blockedSince: to === "BLOCKED" ? now : null,
    reworkNote: to === "PICKUP" ? input.note : to === "IN_PROGRESS" ? room.reworkNote : null,
    oooUntil: to === "OUT_OF_ORDER" ? input.oooUntil : null,
    oooReason: to === "OUT_OF_ORDER" ? oooReason : null,
    oooSince: to === "OUT_OF_ORDER" ? now : null,
    // Released means today's backlog on this room is over — a plan applied
    // later today can still defer it again if it comes back into play.
    deferredSince: to === "INSPECTED" ? null : undefined,
  });

  await audit({
    action: "STATUS_CHANGE",
    userId: session.userId,
    roomId: room.id,
    fromStatus: from,
    toStatus: to,
    meta: { blockReason: input.blockReason, note: input.note, oooUntil: input.oooUntil, oooReason: to === "OUT_OF_ORDER" ? oooReason : undefined, reactivated: SELL_BLOCKED.has(from) && !SELL_BLOCKED.has(to) || undefined, role: session.role },
  });

  // Eine Pause gilt nur für den Zustand, in dem sie gesetzt wurde: jede Statusänderung beendet sie.
  await endPauseOnChange("ROOM", room.id, session.userId, room.id, room.number);

  // Fertig gemeldeter Bleiber mit fälligem Wäschewechsel laut Tagesplan: Wechsel ist erfasst (nur so entsteht ein echtes Wechseldatum).
  // F7 (M10): der heutige Reinigungswunsch des Gastes läuft mit — Start → „In Bearbeitung“, fertig → „Erledigt“
  if (to === "IN_PROGRESS" || to === "CLEAN" || to === "INSPECTED") {
    const todayStart = berlinToUtc(berlinDate(now), "00:00");
    await prisma.guestRequest.updateMany({
      where: { roomId: room.id, kind: "CLEAN_REQUEST", archivedAt: null, createdAt: { gte: todayStart }, status: { in: to === "IN_PROGRESS" ? ["RECEIVED"] : ["RECEIVED", "IN_PROGRESS"] } },
      data: { status: to === "IN_PROGRESS" ? "IN_PROGRESS" : "DONE" },
    });
  }
  if (to === "CLEAN" && input.laundryChanged === true) {
    const due = await prisma.dayRoomPlan.findFirst({ where: { date: berlinDate(now), roomId: room.id, cleaningType: "STAYOVER", laundryDue: true }, select: { id: true } });
    if (due) {
      await prisma.room.update({ where: { id: room.id }, data: { lastLinenChangeAt: now } });
      await audit({ action: "LINEN_CHANGED", userId: session.userId, roomId: room.id, meta: { auto: true } });
    }
  }

  // Starting a room records where the attendant is.
  if (to === "IN_PROGRESS" && session.role === "room_attendant") {
    await prisma.user.update({
      where: { id: session.userId },
      data: { currentRoomId: room.id, lastSeenAt: now },
    });
    broadcast("attendant:location", {
      userId: session.userId,
      name: session.name,
      roomId: room.id,
      roomNumber: room.number,
    });
  }

  if (to === "INSPECTED") {
    // Business rule: INSPECTED is the only status the PMS ever hears about.
    await pms.pushRoomStatus(room.number, "INSPECTED");

    const waiting = await prisma.arrival.findMany({
      where: { roomId: room.id, status: "EXPECTED", notifyOnRelease: true },
    });
    // F5 (H14): VIP-Zimmer erst nach der Ankunftszeit freigegeben → Duty Manager
    for (const a of await prisma.arrival.findMany({ where: { roomId: room.id, vip: true, ...arrivalTodayWhere(now) }, select: { id: true, vip: true, eta: true } })) {
      await alertVipLate({ id: room.id, number: room.number }, a, now).catch(() => 0);
    }
    for (const arrival of waiting) {
      const notification = await prisma.notification.create({
        data: {
          type: "ROOM_RELEASED",
          level: "info",
          targetRole: "front_office",
          roomId: room.id,
          // Ohne Gastnamen (CLAUDE.md): Meldungen gehen per Broadcast an jeden Client.
          message: `Zimmer ${room.number} freigegeben — bereit für die ${arrival.vip ? "VIP-" : ""}Anreise.`,
          ...keyed(arrival.vip ? "notify.roomReleasedVip" : "notify.roomReleased", { n: room.number }),
          dedupeKey: `ROOM_RELEASED:${arrival.id}:${now.getTime()}`,
        },
      });
      broadcast("notification:new", { notification });
    }
  }

  // Ablehnung/Nacharbeit: die heute zuständige Kraft erfährt es sofort (Pop-up + Ton). Nur Zimmer + Etage —
  // der Grund steht als Freitext im Zimmer (reworkNote), nie in der Meldung.
  if (to === "PICKUP") await notifyHousekeeperOfRoomChange({ roomId: room.id, kind: "REWORK", actorId: session.userId, now });

  // F2: Sperre eines belegten Zimmers / mit Anreise heute → dringend an DM, Supervisor der Etage, zugeteilte Housekeeperin;
  // bei Anreise heute zusätzlich Front Office („Anreise in gesperrtes Zimmer“). Nur Zimmer, Grund, Dauer.
  if (to === "OUT_OF_ORDER" && (occupancyRisk.occupied || occupancyRisk.arrivalToday)) {
    const until = input.oooUntil!.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });
    await notifyFloorLeads({
      roomId: room.id, type: "ROOM_BLOCKED_OCCUPIED", level: "warning", housekeeper: true, frontOffice: occupancyRisk.arrivalToday, skipUserId: session.userId, now,
      message: `Zimmer ${room.number} außer Betrieb bis ${until}: ${oooReason}${occupancyRisk.arrivalToday ? " — Anreise heute" : " — Gast im Zimmer"}`,
      key: occupancyRisk.arrivalToday ? "notify.oooArrival" : "notify.oooOccupied", vars: { n: room.number, reason: oooReason, until },
    }).catch(() => 0);
  }

  // F6 (M3, B9): wieder in Betrieb → Fotos erledigter Mängel löschen (Datei + Verweis)
  if (SELL_BLOCKED.has(from) && !SELL_BLOCKED.has(to)) await deleteResolvedDefectPhotos(room.id).catch(() => 0);

  broadcast("room:update", { room: updated });
  broadcast("room:status", { roomId: room.id, number: room.number, from, to, by: session.name });

  return { ok: true, room: updated };
}
