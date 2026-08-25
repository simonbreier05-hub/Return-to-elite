import type { Role } from "@/lib/domain";

/**
 * Shared vocabulary for the guest-facing test screen (Room 305 only — see
 * src/app/guest/305). Framework-agnostic (no prisma import) so both the API
 * routes and the client view can import it.
 *
 * TEST/DEMO SCOPE: hard-wired to one room. Once guests reach this via a real
 * NFC tag / pre-arrival link, GUEST_ROOM_NUMBER goes away in favor of a
 * per-room, per-stay identifier.
 */

export const GUEST_ROOM_NUMBER = "305";

/** Backs RoomNote.authorId / Defect.reportedById for anything a guest submits. */
export const GUEST_SYSTEM_EMAIL = "guest-room305@hotel.test";

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
