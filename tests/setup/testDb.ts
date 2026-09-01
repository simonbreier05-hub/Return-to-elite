import { prisma } from "@/lib/db";
import { generateGuestToken } from "@/lib/rooms/resolveGuestRoom";
import type { Room, User } from "@prisma/client";

/**
 * Minimal Prisma-backed test harness for the guest-facing lib functions.
 * DATABASE_URL is pinned to a scratch sqlite file by vitest.config.ts, and
 * tests/setup/globalSetup.ts pushes the schema into it once before the
 * suite runs — this file just gives individual tests a clean slate and a
 * couple of realistic seed rows to work with.
 */

/** Deletes every table in the same FK-safe order prisma/seed.ts uses. */
export async function resetDb() {
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.defect.deleteMany();
  await prisma.roomNote.deleteMany();
  await prisma.excursion.deleteMany();
  await prisma.arrival.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
}

let roomCounter = 0;

export async function seedRoom(overrides: Partial<Parameters<typeof prisma.room.create>[0]["data"]> = {}): Promise<Room> {
  roomCounter++;
  return prisma.room.create({
    data: {
      number: `T${roomCounter}`,
      floor: 1,
      section: "1A",
      type: "CLASSIC",
      guestToken: generateGuestToken(),
      ...overrides,
    },
  });
}

let userCounter = 0;

export async function seedUser(overrides: Partial<Parameters<typeof prisma.user.create>[0]["data"]> = {}): Promise<User> {
  userCounter++;
  return prisma.user.create({
    data: {
      email: `test-user-${userCounter}@hotel.test`,
      name: `Test User ${userCounter}`,
      passwordHash: "not-a-real-hash",
      role: "room_attendant",
      ...overrides,
    },
  });
}
