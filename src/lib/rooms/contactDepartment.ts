import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import type { Role } from "@/lib/domain";

/**
 * "Abteilung kontaktieren" — reuses the existing Notification model exactly
 * like escalations.ts and reportDefect.ts already do (there is no POST
 * /api/notifications to call; notifications are always created directly by
 * the code that knows about the event).
 */

export const GUEST_CONTACT_DEPARTMENTS = ["concierge", "engineering", "front_office"] as const;
export type GuestContactDepartment = (typeof GUEST_CONTACT_DEPARTMENTS)[number];

export async function contactDepartment(
  roomId: string,
  roomNumber: string,
  department: GuestContactDepartment,
  message: string,
  guestSource: string
) {
  const targetRole: Role = department;
  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_CONTACT",
      level: "info",
      targetRole,
      roomId,
      message: `${guestSource}: ${message}`,
    },
  });

  await audit({
    action: "GUEST_CONTACT",
    userId: null,
    roomId,
    meta: { department, message, guestSource, roomNumber },
  });

  broadcast("notification:new", { notification });

  return notification;
}
