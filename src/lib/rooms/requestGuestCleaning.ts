import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";

/**
 * "Jetzt reinigen" — a guest asking for cleaning is NOT a status change (the
 * room stays whatever it already is), it is a timing signal that feeds the
 * existing priority scoring (see computePriority's guestCleanRequestedFor
 * handling). So this does not go through applyStatusChange — it is a plain
 * field update + audit + broadcast, the same shape as the rest of the
 * extracted guest actions.
 */

export type CleanTarget = "now" | "soon" | "later";

export interface RequestGuestCleaningInput {
  target: CleanTarget;
  /** Required (and only meaningful) when target === "later". */
  laterAt?: Date;
}

export interface RequestGuestCleaningResult {
  ok: true;
  requestedFor: Date;
}

function resolveRequestedFor(now: Date, input: RequestGuestCleaningInput): Date {
  if (input.target === "now") return now;
  if (input.target === "soon") return new Date(now.getTime() + 30 * 60_000);
  // "later": trust the guest's chosen time if it's in the future, otherwise
  // fall back to "now" rather than scheduling a request in the past.
  if (input.laterAt && input.laterAt.getTime() > now.getTime()) return input.laterAt;
  return now;
}

export async function requestGuestCleaning(
  roomId: string,
  roomNumber: string,
  guestSource: string,
  input: RequestGuestCleaningInput
): Promise<RequestGuestCleaningResult> {
  const now = new Date();
  const requestedFor = resolveRequestedFor(now, input);

  const room = await prisma.room.update({
    where: { id: roomId },
    data: { guestCleanRequestedAt: now, guestCleanRequestedFor: requestedFor },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  await audit({
    action: "GUEST_CLEAN_REQUESTED",
    userId: null,
    roomId,
    meta: { target: input.target, requestedFor: requestedFor.toISOString(), guestSource, roomNumber },
  });

  broadcast("room:update", { room });

  return { ok: true, requestedFor };
}
