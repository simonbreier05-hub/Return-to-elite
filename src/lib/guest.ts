import type { Role } from "@/lib/domain";

/**
 * Shared vocabulary for the guest-facing screen (src/app/guest/[roomNumber]).
 * Framework-agnostic (no prisma import) so both the API routes and the
 * client view can import it.
 */

/**
 * Backs RoomNote.authorId / Defect.reportedById for anything any guest
 * submits, across every room — there is one shared system account, not one
 * per room, since the room itself is already captured on the note/defect.
 */
export const GUEST_SYSTEM_EMAIL = "guest-system@hotel.test";

export const DND_WINDOWS = ["NOW", "TWO_HOURS", "MORNING", "UNTIL_FURTHER"] as const;
export type DndWindow = (typeof DND_WINDOWS)[number];
export const DND_WINDOW_LABELS: Record<DndWindow, string> = {
  NOW: "Jetzt",
  TWO_HOURS: "Nächste 2 Stunden",
  MORNING: "Ganzer Vormittag",
  UNTIL_FURTHER: "Bis auf Weiteres",
};

export const CLEAN_TIMINGS = ["NOW", "IN_30", "LATER"] as const;
export type CleanTiming = (typeof CLEAN_TIMINGS)[number];
export const CLEAN_TIMING_LABELS: Record<CleanTiming, string> = {
  NOW: "Sofort",
  IN_30: "In 30 Minuten",
  LATER: "Später heute",
};

/**
 * Guest-facing department labels mapped to the app's real staff roles.
 * There is no dedicated "room service" role today — front_office is the
 * closest existing desk contact for it. Revisit this mapping if one is
 * ever added.
 */
export const CONTACT_DEPARTMENTS: { key: string; label: string; role: Role }[] = [
  { key: "housekeeping", label: "Housekeeping", role: "supervisor" },
  { key: "room_service", label: "Room Service", role: "front_office" },
  { key: "concierge", label: "Concierge", role: "concierge" },
  { key: "engineering", label: "Engineering", role: "engineering" },
];
